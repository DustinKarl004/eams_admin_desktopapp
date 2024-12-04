import { db } from '../firebase_config.js';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Modal functionality
const addExamineeBtn = document.getElementById('addExamineeBtn');
const examineeModal = new bootstrap.Modal(document.getElementById('examineeModal'));
const updateExamineeModal = new bootstrap.Modal(document.getElementById('updateExamineeModal'));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const idSelect = document.getElementById('idSelect');
const saveExamineeBtn = document.getElementById('saveExaminee');
const updateExamineeBtn = document.getElementById('updateExaminee');
const confirmDeleteBtn = document.getElementById('confirmDelete');

let nextEntranceIdNumber = 1;
let deletedEntranceIds = [];

addExamineeBtn.addEventListener('click', () => {
    populateIdSelect();
    examineeModal.show();
});

async function populateIdSelect() {
    idSelect.innerHTML = '<option value="">Select an Examinee (Kindly wait for the emails to load)</option>';
    const examineesSnapshot = await getDocs(collection(db, 'transferee_approved_applicants'));
    const scheduledUsersSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    const scheduledIds = new Set(scheduledUsersSnapshot.docs.map(doc => doc.id));

    examineesSnapshot.forEach(doc => {
        const id = doc.id;
        if (!scheduledIds.has(id)) {
            const option = document.createElement('option');
            option.value = id;
            const userData = doc.data();
            option.textContent = `${userData.email} - ${userData.fullName}`;
            idSelect.appendChild(option);
        }
    });
}

idSelect.addEventListener('change', async () => {
    const selectedId = idSelect.value;
    const emailInput = document.getElementById('email');
    const fullNameInput = document.getElementById('fullName');
    
    if (selectedId) {
        const userDoc = await getDoc(doc(db, 'transferee_approved_applicants', selectedId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            emailInput.value = userData.email || '';
            fullNameInput.value = userData.fullName || '';
        }
    } else {
        emailInput.value = '';
        fullNameInput.value = '';
    }
});

function generateRandomWord(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

async function generateEntranceId() {
    if (deletedEntranceIds.length > 0) {
        return deletedEntranceIds.shift();
    }
    
    const randomWord = generateRandomWord(5);
    let numberPart;
    
    // Check both freshmen and transferee collections
    const freshmenSnapshot = await getDocs(collection(db, 'freshmen_examinees'));
    const transfereeSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    
    const allEntranceIds = [
        ...freshmenSnapshot.docs.map(doc => doc.data().entranceId),
        ...transfereeSnapshot.docs.map(doc => doc.data().entranceId)
    ];
    
    do {
        numberPart = nextEntranceIdNumber.toString().padStart(4, '0');
        nextEntranceIdNumber++;
    } while (allEntranceIds.some(id => id.endsWith(numberPart)));
    
    return `${randomWord}${numberPart}`;
}

saveExamineeBtn.addEventListener('click', async () => {
    const id = idSelect.value;
    const email = document.getElementById('email').value;
    const fullName = document.getElementById('fullName').value;
    const batchNumber = document.getElementById('batchNumber').value;
    const examDate = document.getElementById('examDate').value;
    const examStartTime = document.getElementById('examStartTime').value;
    const examEndTime = document.getElementById('examEndTime').value;
    const room = document.getElementById('room').value;
    const entranceId = await generateEntranceId();

    if (id && email && fullName && batchNumber && examDate && examStartTime && examEndTime && room && entranceId) {
        try {
            const qr = qrcode(0, 'L');
            qr.addData(entranceId);
            qr.make();
            const qrCodeDataUrl = qr.createDataURL(5);

            await setDoc(doc(db, 'transferee_examinees', id), {
                email,
                fullName,
                batchNumber,
                examDate,
                examStartTime,
                examEndTime,
                room,
                entranceId,
                qrCode: qrCodeDataUrl
            });

            // Store notification in Notifications collection
            const notificationRef = doc(db, 'Notifications', email);
            const notificationSnap = await getDoc(notificationRef);
            
            const newNotification = {
                category: 'Schedule',
                message: 'Your entrance exam schedule has been set. Please check your schedule details by clicking this notification.',
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
                message: 'Your entrance exam schedule is now available. Please open your mobile application and check the notification icon to view your schedule details.'
            };

            emailjs.send('service_3j9xxep', 'template_d3q9lfw', templateParams)
                .then(function(response) {
                    console.log('Schedule notification email sent successfully:', response);
                }, function(error) {
                    console.error('Schedule notification email failed:', error);
                });

            examineeModal.hide();
            fetchExaminees();
            showAlert('Examinee added successfully and notification sent.');
        } catch (error) {
            console.error('Error saving examinee:', error);
            showAlert('An error occurred while saving the examinee. Please try again.');
        }
    } else {
        showAlert('Please fill all fields');
    }
});

function showAlert(message) {
    document.getElementById('alertMessage').textContent = message;
    alertModal.show();
}

let examinees = [];
let currentSort = { field: null, direction: 'asc' };

async function fetchExaminees(searchTerm = '') {
    try {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('examineeTableBody').innerHTML = '';
        document.getElementById('totalExamineesCount').textContent = 'Loading...';

        const examineesSnapshot = await getDocs(collection(db, 'transferee_examinees'));
        examinees = examineesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (searchTerm) {
            examinees = examinees.filter(examinee =>
                examinee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                examinee.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        sortExaminees(currentSort.field, currentSort.direction);
        renderExamineeTable();
    } catch (error) {
        console.error("Error fetching examinees:", error);
        showAlert('An error occurred while fetching examinees. Please try again.');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

function renderExamineeTable() {
    const tableBody = document.getElementById('examineeTableBody');
    tableBody.innerHTML = '';
    examinees.forEach(examinee => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = examinee.batchNumber;
        row.insertCell().textContent = examinee.fullName;
        row.insertCell().textContent = formatDate(examinee.examDate);
        row.insertCell().textContent = formatTime(examinee.examStartTime) + ' - ' + formatTime(examinee.examEndTime);
        row.insertCell().textContent = examinee.room;
        
        const actionsCell = row.insertCell();
        const updateBtn = document.createElement('button');
        updateBtn.innerHTML = '<i class="fas fa-edit me-2"></i>Update';
        updateBtn.className = 'btn btn-sm btn-primary me-2';
        updateBtn.addEventListener('click', () => showUpdateModal(examinee.id, examinee));
        actionsCell.appendChild(updateBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt me-2"></i>Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.addEventListener('click', () => showDeleteConfirmModal(examinee.id, examinee.email, examinee.entranceId));
        actionsCell.appendChild(deleteBtn);
    });

    document.getElementById('totalExamineesCount').textContent = examinees.length;
}

function showUpdateModal(id, data) {
    document.getElementById('updateExamineeId').value = id;
    document.getElementById('updateEmail').value = data.email;
    document.getElementById('updateFullName').value = data.fullName;
    document.getElementById('updateBatchNumber').value = data.batchNumber;
    document.getElementById('updateExamDate').value = data.examDate;
    document.getElementById('updateExamStartTime').value = data.examStartTime;
    document.getElementById('updateExamEndTime').value = data.examEndTime;
    document.getElementById('updateRoom').value = data.room;
    updateExamineeModal.show();
}

updateExamineeBtn.addEventListener('click', async () => {
    const id = document.getElementById('updateExamineeId').value;
    const batchNumber = document.getElementById('updateBatchNumber').value;
    const examDate = document.getElementById('updateExamDate').value;
    const examStartTime = document.getElementById('updateExamStartTime').value;
    const examEndTime = document.getElementById('updateExamEndTime').value;
    const room = document.getElementById('updateRoom').value;

    if (id && batchNumber && examDate && examStartTime && examEndTime && room) {
        try {
            await updateDoc(doc(db, 'transferee_examinees', id), {
                batchNumber,
                examDate,
                examStartTime,
                examEndTime,
                room
            });
            updateExamineeModal.hide();
            fetchExaminees();
            showAlert('Examinee updated successfully.');
        } catch (error) {
            console.error('Error updating examinee:', error);
            showAlert('An error occurred while updating the examinee. Please try again.');
        }
    } else {
        showAlert('Please fill all fields');
    }
});

function showDeleteConfirmModal(id, email, entranceId) {
    confirmDeleteBtn.onclick = () => deleteExaminee(id, email, entranceId);
    deleteConfirmModal.show();
}

async function deleteExaminee(id, email, entranceId) {
    try {
        // Check if there's a result record for this email
        const resultQuery = query(collection(db, 'transferee_examinees_result'), where('email', '==', email));
        const resultSnapshot = await getDocs(resultQuery);

        // Check if there's an assessment record for this email
        const assessmentQuery = query(collection(db, 'transferee_assessment'), where('email', '==', email));
        const assessmentSnapshot = await getDocs(assessmentQuery);

        // Check if there's an enrollment record for this email
        const enrollmentQuery = query(collection(db, 'transferee_enrollment'), where('email', '==', email));
        const enrollmentSnapshot = await getDocs(enrollmentQuery);

        // Check if there's a medical completion record for this email
        const medicalQuery = query(collection(db, 'transferee_medical_completion'), where('email', '==', email));
        const medicalSnapshot = await getDocs(medicalQuery);

        if (!resultSnapshot.empty || !assessmentSnapshot.empty || !enrollmentSnapshot.empty || !medicalSnapshot.empty) {
            let message = 'Cannot delete examinee. ';
            if (!resultSnapshot.empty) message += 'A result record exists for this email. ';
            if (!assessmentSnapshot.empty) message += 'An assessment record exists for this email. ';
            if (!enrollmentSnapshot.empty) message += 'An enrollment record exists for this email. ';
            if (!medicalSnapshot.empty) message += 'A medical completion record exists for this email. ';
            message += 'Please delete these records first before deleting the examinee.';
            showAlert(message);
            deleteConfirmModal.hide();
            return;
        }

        await deleteDoc(doc(db, 'transferee_examinees', id));
        deletedEntranceIds.push(entranceId);
        deletedEntranceIds.sort();
        deleteConfirmModal.hide();
        fetchExaminees();
        showAlert('Examinee deleted successfully.');
    } catch (error) {
        console.error('Error deleting examinee:', error);
        showAlert('An error occurred while deleting the examinee. Please try again.');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours));
    date.setMinutes(parseInt(minutes));
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', (event) => {
    fetchExaminees(event.target.value);
});

// Sort functionality
function sortExaminees(field, direction) {
    examinees.sort((a, b) => {
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
        sortExaminees(currentSort.field, currentSort.direction);
        renderExamineeTable();
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

// Initial fetch of examinee data
fetchExaminees();
