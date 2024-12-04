import { db } from '../firebase_config.js';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let approvedApplicants = [];
let currentSort = { field: null, direction: 'asc' };

const addApprovedApplicantBtn = document.getElementById('addApprovedApplicantBtn');
const approvedApplicantModal = new bootstrap.Modal(document.getElementById('approvedApplicantModal'));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const idSelect = document.getElementById('idSelect');
const saveApprovedApplicantBtn = document.getElementById('saveApprovedApplicant');
const confirmDeleteBtn = document.getElementById('confirmDelete');

addApprovedApplicantBtn.addEventListener('click', () => {
    populateIdSelect();
    approvedApplicantModal.show();
});

async function populateIdSelect() {
    idSelect.innerHTML = '<option value="">Select an Email (Kindly wait for the emails to load)</option>';
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const approvedApplicantsSnapshot = await getDocs(collection(db, 'freshmen_approved_applicants'));
    const approvedIds = new Set(approvedApplicantsSnapshot.docs.map(doc => doc.id));

    const priorityApplicants = [];
    const montalbamApplicants = [];

    for (const doc of usersSnapshot.docs) {
        const id = doc.id;
        const userData = doc.data();
        if (!approvedIds.has(id) && userData.email) {
            const applicantData = await getApplicantData(userData.email);
            if (applicantData) {
                const isFromMontalban = checkIfFromMontalban(applicantData);
                const hasHonors = checkIfHasHonors(applicantData);
                
                // Only proceed if applicant is from Montalban
                if (isFromMontalban) {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = userData.email;

                    if (hasHonors) {
                        option.dataset.priority = 'highest';
                        priorityApplicants.push(option);
                    } else {
                        option.dataset.priority = 'montalban';
                        montalbamApplicants.push(option);
                    }
                }
            }
        }
    }

    // Add options in priority order
    if (priorityApplicants.length > 0) {
        const priorityGroup = document.createElement('optgroup');
        priorityGroup.label = 'Priority: From Montalban with Honors';
        priorityApplicants.forEach(opt => priorityGroup.appendChild(opt));
        idSelect.appendChild(priorityGroup);
    }

    if (montalbamApplicants.length > 0) {
        const montalbamGroup = document.createElement('optgroup');
        montalbamGroup.label = 'Priority: From Montalban';
        montalbamApplicants.forEach(opt => montalbamGroup.appendChild(opt));
        idSelect.appendChild(montalbamGroup);
    }
}

async function getApplicantData(email) {
    const docRef = doc(db, 'freshmen_applicant_form', email);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
}

function checkIfFromMontalban(data) {
    const addressInfo = data.address_and_cn || {};
    return addressInfo.municipality?.toLowerCase().includes('montalban') || 
           addressInfo.municipality?.toLowerCase().includes('rodriguez');
}

function checkIfHasHonors(data) {
    const educationInfo = data.education || {};
    return educationInfo.senior_high_honors && 
           educationInfo.senior_high_honors.toLowerCase() !== 'none' &&
           educationInfo.senior_high_honors.toLowerCase() !== 'n/a' &&
           educationInfo.senior_high_honors.trim() !== '';
}

idSelect.addEventListener('change', async () => {
    const selectedId = idSelect.value;
    const emailInput = document.getElementById('email');
    const fullNameInput = document.getElementById('fullName');
    const applicationStatusInput = document.getElementById('applicationStatus');
    const loadingDetails = document.getElementById('loadingDetails');
    
    if (selectedId) {
        loadingDetails.style.display = 'block';
        emailInput.value = '';
        fullNameInput.value = '';
        applicationStatusInput.value = '';
        saveApprovedApplicantBtn.disabled = true;

        try {
            const userDoc = await getDoc(doc(db, 'users', selectedId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                emailInput.value = userData.email || '';

                const applicantFormDoc = await getDoc(doc(db, 'freshmen_applicant_form', userData.email));
                if (applicantFormDoc.exists()) {
                    const applicantData = applicantFormDoc.data();
                    const applicantInfo = applicantData.applicant_info || {};
                    let last_name = applicantInfo.last_name || '';
                    let first_name = applicantInfo.first_name || '';
                    let middle_name = applicantInfo.middle_name || '';

                    if (middle_name.toLowerCase() === 'n/a') {
                        middle_name = '';
                    }

                    const fullName = `${last_name}, ${first_name} ${middle_name}`.trim();
                    fullNameInput.value = fullName;

                    // Check if all forms are filled
                    const categories = [
                        'address_and_cn',
                        'applicant_info',
                        'captured_image',
                        'course',
                        'education',
                        'family_income',
                        'family_info',
                        'guardian_info',
                        'other_applicant_info',
                        'parents_info',
                        'proof_of_eligibility',
                        'proof_of_residency',
                        'sector_and_work_status'
                    ];

                    const allFormsFilled = categories.every(category => 
                        applicantData[category] && Object.keys(applicantData[category]).length > 0
                    );

                    const isFromMontalban = checkIfFromMontalban(applicantData);
                    const hasHonors = checkIfHasHonors(applicantData);

                    let status = allFormsFilled ? 'All forms filled' : 'Incomplete forms';
                    if (isFromMontalban) {
                        status += hasHonors ? ' | Priority: From Montalban with Honors' : ' | Priority: From Montalban';
                    }

                    applicationStatusInput.value = status;
                    saveApprovedApplicantBtn.disabled = !allFormsFilled;
                }
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            applicationStatusInput.value = 'Error fetching data';
        } finally {
            loadingDetails.style.display = 'none';
        }
    } else {
        emailInput.value = '';
        fullNameInput.value = '';
        applicationStatusInput.value = '';
        saveApprovedApplicantBtn.disabled = true;
    }
});

saveApprovedApplicantBtn.addEventListener('click', async () => {
    const id = idSelect.value;
    const email = document.getElementById('email').value;
    const fullName = document.getElementById('fullName').value;

    if (id && email && fullName) {
        try {
            await setDoc(doc(db, 'freshmen_approved_applicants', id), {
                email,
                fullName,
                dateApproved: serverTimestamp()
            });

            // Store notification in Notifications collection
            const notificationRef = doc(db, 'Notifications', email);
            const notificationSnap = await getDoc(notificationRef);
            
            const newNotification = {
                category: 'Application Approval',
                message: 'Your application has been approved.',
                timestamp: new Date().toISOString(),
                status: 'unread'
            };

            if (notificationSnap.exists()) {
                const currentList = notificationSnap.data().list || [];
                await setDoc(notificationRef, {
                    list: [...currentList, newNotification]
                }, { merge: true });
            } else {
                await setDoc(notificationRef, {
                    list: [newNotification]
                });
            }

            // Send email notification
            const templateParams = {
                to_email: email,
                to_name: fullName,
                message: 'Your application has been approved. Please wait for further instructions regarding the entrance exam schedule. You will receive another email once your schedule has been set.'
            };

            emailjs.send('service_3j9xxep', 'template_d3q9lfw', templateParams)
                .then(function(response) {
                    console.log('Email sent successfully:', response);
                }, function(error) {
                    console.error('Email send failed:', error);
                });

            approvedApplicantModal.hide();
            fetchApprovedApplicants();
            showAlert('Approved applicant added successfully and notification sent.');
        } catch (error) {
            console.error('Error saving approved applicant:', error);
            showAlert('An error occurred while saving the approved applicant. Please try again.');
        }
    } else {
        showAlert('Please fill all fields');
    }
});

function showAlert(message) {
    document.getElementById('alertMessage').textContent = message;
    alertModal.show();
}

async function fetchApprovedApplicants(searchTerm = '') {
    try {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('approvedApplicantTableBody').innerHTML = '';
        document.getElementById('totalApprovedCount').textContent = 'Loading...';

        const approvedApplicantsSnapshot = await getDocs(collection(db, 'freshmen_approved_applicants'));
        approvedApplicants = approvedApplicantsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (searchTerm) {
            approvedApplicants = approvedApplicants.filter(applicant =>
                applicant.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                applicant.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        sortApprovedApplicants(currentSort.field, currentSort.direction);
        renderApprovedApplicantTable();
    } catch (error) {
        console.error("Error fetching approved applicants:", error);
        showAlert('An error occurred while fetching approved applicants. Please try again.');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

function renderApprovedApplicantTable() {
    const tableBody = document.getElementById('approvedApplicantTableBody');
    tableBody.innerHTML = '';
    approvedApplicants.forEach(applicant => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = applicant.fullName;
        row.insertCell().textContent = applicant.email;
        
        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt me-2"></i>Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.addEventListener('click', () => showDeleteConfirmModal(applicant.id, applicant.email));
        actionsCell.appendChild(deleteBtn);
    });

    document.getElementById('totalApprovedCount').textContent = approvedApplicants.length;
}

function showDeleteConfirmModal(id, email) {
    confirmDeleteBtn.onclick = () => deleteApprovedApplicant(id, email);
    deleteConfirmModal.show();
}

async function deleteApprovedApplicant(id, email) {
    try {
        // Check if there's an examinee record for this email
        const examineeQuery = query(collection(db, 'freshmen_examinees'), where('email', '==', email));
        const examineeSnapshot = await getDocs(examineeQuery);

        // Check if there's an examinee result record for this email
        const resultQuery = query(collection(db, 'freshmen_examinees_result'), where('email', '==', email));
        const resultSnapshot = await getDocs(resultQuery);

        if (!examineeSnapshot.empty || !resultSnapshot.empty) {
            let message = 'Cannot delete approved applicant. ';
            if (!examineeSnapshot.empty) message += 'An examinee schedule record exists for this email. ';
            if (!resultSnapshot.empty) message += 'An examinee result record exists for this email. ';
            message += 'Please delete these records first before deleting the approved applicant.';
            showAlert(message);
            deleteConfirmModal.hide();
            return;
        }

        await deleteDoc(doc(db, 'freshmen_approved_applicants', id));
        deleteConfirmModal.hide();
        fetchApprovedApplicants();
        showAlert('Approved applicant deleted successfully.');
    } catch (error) {
        console.error('Error deleting approved applicant:', error);
        showAlert('An error occurred while deleting the approved applicant. Please try again.');
    }
}

document.getElementById('searchInput').addEventListener('input', (event) => {
    fetchApprovedApplicants(event.target.value);
});

function sortApprovedApplicants(field, direction) {
    approvedApplicants.sort((a, b) => {
        if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
        if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (currentSort.field === field) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.direction = 'asc';
        }
        sortApprovedApplicants(currentSort.field, currentSort.direction);
        renderApprovedApplicantTable();
        updateSortIcons();
    });
});

function updateSortIcons() {
    document.querySelectorAll('th[data-sort] i.fas:not(:first-child)').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    if (currentSort.field) {
        const th = document.querySelector(`th[data-sort="${currentSort.field}"]`);
        const icon = th.querySelector('i:not(:first-child)');
        icon.className = `fas fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'}`;
    }
}

fetchApprovedApplicants();