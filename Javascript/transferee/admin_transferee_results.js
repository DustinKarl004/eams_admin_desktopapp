import { db } from '../firebase_config.js';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let results = [];
let currentSort = { field: null, direction: 'asc' };

// Add Result Modal functionality
const addResultBtn = document.getElementById('addResultBtn');
const addResultModal = new bootstrap.Modal(document.getElementById('addResultModal'));
const updateResultModal = new bootstrap.Modal(document.getElementById('updateResultModal'));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const selectId = document.getElementById('selectId');
const instituteSelect = document.getElementById('institute');
const courseSelect = document.getElementById('course');

addResultBtn.addEventListener('click', () => {
    populateIdSelect();
    addResultModal.show();
});

async function populateIdSelect() {
    selectId.innerHTML = '<option value="">Select an ID (Kindly wait for the emails to load)</option>';
    const examineesSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    const resultsSnapshot = await getDocs(collection(db, 'transferee_examinees_result'));
    const resultIds = new Set(resultsSnapshot.docs.map(doc => doc.id));

    // Get all entrance exam records
    const entranceExamSnapshot = await getDocs(collection(db, 'EntranceExam'));
    const entranceExamEmails = new Set(entranceExamSnapshot.docs.map(doc => doc.id));

    examineesSnapshot.forEach(doc => {
        const id = doc.id;
        const examineeData = doc.data();
        
        // Only add if not in results AND has matching entrance exam record
        if (!resultIds.has(id) && entranceExamEmails.has(examineeData.email)) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${examineeData.email} - ${examineeData.fullName}`;
            selectId.appendChild(option);
        }
    });
}

selectId.addEventListener('change', async () => {
    const selectedId = selectId.value;
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    
    if (selectedId) {
        const examineeDoc = await getDoc(doc(db, 'transferee_examinees', selectedId));
        if (examineeDoc.exists()) {
            const examineeData = examineeDoc.data();
            fullNameInput.value = examineeData.fullName || '';
            emailInput.value = examineeData.email || '';
        }
    } else {
        fullNameInput.value = '';
        emailInput.value = '';
    }
});

instituteSelect.addEventListener('change', () => {
    const selectedInstitute = instituteSelect.value;
    courseSelect.innerHTML = '<option value="">Select a Course</option>';
    
    if (selectedInstitute === 'ICS') {
        addCourseOption('BSIT', 'Bachelor of Science in Information Technology');
        addCourseOption('BSCPE', 'Bachelor of Science in Computer Engineering');
    } else if (selectedInstitute === 'ITE') {
        addCourseOption('BSEd-Sci', 'Bachelor of Secondary Education major in Science');
        addCourseOption('BEEd-G', 'Bachelor of Elementary Education - Generalist');
        addCourseOption('BECEd', 'Bachelor of Early Childhood Education');
        addCourseOption('BTLEd-ICT', 'Bachelor of Technology and Livelihood Education - ICT');
        addCourseOption('TCP', 'Teacher Certificate Program');
    } else if (selectedInstitute === 'IBE') {
        addCourseOption('BSBA-HRM', 'Bachelor of Science in Business Administration major in Human Resource Management');
        addCourseOption('BSEntrep', 'Bachelor of Science in Entrepreneurship');
    }
});

function addCourseOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    courseSelect.appendChild(option);
}

window.addResult = async function() {
    const id = selectId.value;
    const email = document.getElementById('email').value;
    const fullName = document.getElementById('fullName').value;
    const institute = instituteSelect.value;
    const course = courseSelect.value;

    if (id && email && fullName && institute && course) {
        try {
            await setDoc(doc(db, 'transferee_examinees_result', id), {
                email,
                fullName,
                institute,
                course
            });

            // Store notification in Notifications collection
            const notificationRef = doc(db, 'Notifications', email);
            const notificationSnap = await getDoc(notificationRef);
            
            const newNotification = {
                category: 'Results',
                message: 'Your entrance exam result is now available. Please check your result details by clicking this notification. Also click Student Portal to check what your next step is.',
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
                message: 'Your entrance exam result is now available. Please open your mobile application and check the notification icon to view your results details. You can now proceed with uploading your required documents in your Mobile Application.'
            };

            emailjs.send('service_3j9xxep', 'template_d3q9lfw', templateParams)
                .then(function(response) {
                    console.log('Results notification email sent successfully:', response);
                }, function(error) {
                    console.error('Results notification email failed:', error);
                });

            addResultModal.hide();
            fetchResults();
            showAlert('Result added successfully and notification sent.');
        } catch (error) {
            console.error('Error saving result:', error);
            showAlert('An error occurred while saving the result. Please try again.');
        }
    } else {
        showAlert('Please fill all fields');
    }
};

function showAlert(message) {
    document.getElementById('alertMessage').textContent = message;
    alertModal.show();
}

async function fetchResults(searchTerm = '') {
    try {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('resultTableBody').innerHTML = '';
        document.getElementById('totalResultsCount').textContent = 'Loading...';

        const resultsSnapshot = await getDocs(collection(db, 'transferee_examinees_result'));
        results = resultsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (searchTerm) {
            results = results.filter(result =>
                result.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                result.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        sortResults(currentSort.field, currentSort.direction);
        renderResultTable();
    } catch (error) {
        console.error("Error fetching results:", error);
        showAlert('An error occurred while fetching results. Please try again.');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

function renderResultTable() {
    const tableBody = document.getElementById('resultTableBody');
    tableBody.innerHTML = '';
    results.forEach(result => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = result.email;
        row.insertCell().textContent = result.fullName;
        row.insertCell().textContent = result.institute;
        row.insertCell().textContent = result.course;
        
        const actionsCell = row.insertCell();
        const updateBtn = document.createElement('button');
        updateBtn.innerHTML = '<i class="fas fa-edit"></i> Update';
        updateBtn.className = 'btn btn-sm btn-primary me-2';
        updateBtn.addEventListener('click', () => showUpdateModal(result.id, result));
        actionsCell.appendChild(updateBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.addEventListener('click', () => showDeleteConfirmModal(result.id, result.email));
        actionsCell.appendChild(deleteBtn);
    });

    document.getElementById('totalResultsCount').textContent = results.length;
}

function showUpdateModal(id, data) {
    document.getElementById('updateResultId').value = id;
    document.getElementById('updateEmail').value = data.email;
    document.getElementById('updateFullName').value = data.fullName;
    document.getElementById('updateInstitute').value = data.institute;
    populateUpdateCourseSelect(data.institute);
    document.getElementById('updateCourse').value = data.course;
    updateResultModal.show();
}

function populateUpdateCourseSelect(institute) {
    const updateCourseSelect = document.getElementById('updateCourse');
    updateCourseSelect.innerHTML = '<option value="">Select a Course</option>';
    
    if (institute === 'ICS') {
        addUpdateCourseOption('BSIT', 'Bachelor of Science in Information Technology');
        addUpdateCourseOption('BSCPE', 'Bachelor of Science in Computer Engineering');
    } else if (institute === 'ITE') {
        addUpdateCourseOption('BSEd-Sci', 'Bachelor of Secondary Education major in Science');
        addUpdateCourseOption('BEEd-G', 'Bachelor of Elementary Education - Generalist');
        addUpdateCourseOption('BECEd', 'Bachelor of Early Childhood Education');
        addUpdateCourseOption('BTLEd-ICT', 'Bachelor of Technology and Livelihood Education - ICT');
        addUpdateCourseOption('TCP', 'Teacher Certificate Program');
    } else if (institute === 'IBE') {
        addUpdateCourseOption('BSBA-HRM', 'Bachelor of Science in Business Administration major in Human Resource Management');
        addUpdateCourseOption('BSEntrep', 'Bachelor of Science in Entrepreneurship');
    }
}

function addUpdateCourseOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    document.getElementById('updateCourse').appendChild(option);
}

document.getElementById('updateInstitute').addEventListener('change', (event) => {
    populateUpdateCourseSelect(event.target.value);
});

window.updateResult = async function() {
    const id = document.getElementById('updateResultId').value;
    const email = document.getElementById('updateEmail').value;
    const fullName = document.getElementById('updateFullName').value;
    const institute = document.getElementById('updateInstitute').value;
    const course = document.getElementById('updateCourse').value;

    if (id && email && fullName && institute && course) {
        try {
            await updateDoc(doc(db, 'transferee_examinees_result', id), {
                email,
                fullName,
                institute,
                course
            });
            updateResultModal.hide();
            fetchResults();
            showAlert('Result updated successfully.');
        } catch (error) {
            console.error('Error updating result:', error);
            showAlert('An error occurred while updating the result. Please try again.');
        }
    } else {
        showAlert('Please fill all fields');
    }
};

function showDeleteConfirmModal(id, email) {
    document.getElementById('confirmDelete').onclick = () => deleteResult(id, email);
    deleteConfirmModal.show();
}

async function deleteResult(id, email) {
    try {
        // Check if there's an assessment record for this email
        const assessmentQuery = query(collection(db, 'transferee_assessment'), where('email', '==', email));
        const assessmentSnapshot = await getDocs(assessmentQuery);

        // Check if there's an enrollment record for this email
        const enrollmentQuery = query(collection(db, 'transferee_enrollment'), where('email', '==', email));
        const enrollmentSnapshot = await getDocs(enrollmentQuery);

        // Check if there's a medical completion record for this email
        const medicalQuery = query(collection(db, 'transferee_medical_completion'), where('email', '==', email));
        const medicalSnapshot = await getDocs(medicalQuery);

        if (!assessmentSnapshot.empty || !enrollmentSnapshot.empty || !medicalSnapshot.empty) {
            let message = 'Cannot delete result. ';
            if (!assessmentSnapshot.empty) message += 'An assessment record exists for this email. ';
            if (!enrollmentSnapshot.empty) message += 'An enrollment record exists for this email. ';
            if (!medicalSnapshot.empty) message += 'A medical completion record exists for this email. ';
            message += 'Please delete these records first before deleting the result.';
            showAlert(message);
            deleteConfirmModal.hide();
            return;
        }

        await deleteDoc(doc(db, 'transferee_examinees_result', id));
        deleteConfirmModal.hide();
        fetchResults();
        showAlert('Result deleted successfully.');
    } catch (error) {
        console.error('Error deleting result:', error);
        showAlert('An error occurred while deleting the result. Please try again.');
    }
}

function sortResults(field, direction) {
    results.sort((a, b) => {
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
        sortResults(currentSort.field, currentSort.direction);
        renderResultTable();
        updateSortIcons();
    });
});

function updateSortIcons() {
    document.querySelectorAll('th[data-sort] i.fas:not(.fa-envelope):not(.fa-user):not(.fa-university):not(.fa-graduation-cap)').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    if (currentSort.field) {
        const th = document.querySelector(`th[data-sort="${currentSort.field}"]`);
        const icon = th.querySelector('i.fas:not(.fa-envelope):not(.fa-user):not(.fa-university):not(.fa-graduation-cap)');
        icon.className = `fas fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'}`;
    }
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', (event) => {
    fetchResults(event.target.value);
});

// Initial fetch of result data
fetchResults();
