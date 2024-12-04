import { db } from '../firebase_config.js';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Modal functionality
const addExamineeBtn = document.getElementById('addExamineeBtn');
const examineeModal = new bootstrap.Modal(document.getElementById('examineeModal'));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const idSelect = document.getElementById('idSelect');
const saveExamineeBtn = document.getElementById('saveExaminee');
const confirmDeleteBtn = document.getElementById('confirmDelete');

let nextEntranceIdNumber = 1;
let deletedEntranceIds = [];

// Define batch schedules
const batchSchedules = [
    { startTime: '09:00', endTime: '11:00', room: 'Lab 1' },
    { startTime: '09:00', endTime: '11:00', room: 'Lab 2' },
    { startTime: '13:00', endTime: '15:00', room: 'Lab 1' },
    { startTime: '13:00', endTime: '15:00', room: 'Lab 2' }
];

addExamineeBtn.addEventListener('click', () => {
    populateIdSelect();
    examineeModal.show();
});

async function populateIdSelect() {
    idSelect.innerHTML = '<option value="">Select an Examinee (Kindly wait for the emails to load)</option>';
    const examineesSnapshot = await getDocs(collection(db, 'freshmen_approved_applicants'));
    const scheduledUsersSnapshot = await getDocs(collection(db, 'freshmen_examinees'));
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

    // Set min date to today
    const examDateInput = document.getElementById('examDate');
    const today = new Date();
    const formattedDate = today.toISOString().split('T')[0];
    examDateInput.min = formattedDate;

    // Handle date selection
    examDateInput.addEventListener('input', async () => {
        const selectedDate = examDateInput.value;
        saveExamineeBtn.disabled = true; // Disable button by default
        
        // Check if selected date is not past
        const selectedDateTime = new Date(selectedDate);
        const currentDate = new Date();
        currentDate.setHours(0,0,0,0);

        if (selectedDateTime < currentDate) {
            examDateInput.style.backgroundColor = '#ffebee';
            showAlert('Cannot select past dates. Please select a current or future date.');
            examDateInput.value = '';
            return;
        }

        const isDateFull = await checkIfDateIsFull(selectedDate);
        if (isDateFull) {
            examDateInput.style.backgroundColor = '#ffebee';
            showAlert('This date has reached the maximum number of examinees (4 batches). Please select another date.');
            examDateInput.value = '';
        } else {
            // Check if there are any existing exam dates
            const examineesSnapshot = await getDocs(collection(db, 'freshmen_examinees'));
            const existingDates = examineesSnapshot.docs.map(doc => doc.data().examDate);
            
            if (existingDates.length > 0) {
                // If dates exist, only allow selection of dates that already have examinees
                // unless all existing dates are full
                const dateHasExaminees = existingDates.includes(selectedDate);
                const allExistingDatesFull = await Promise.all(
                    [...new Set(existingDates)].map(async date => await checkIfDateIsFull(date))
                );

                if (!dateHasExaminees && !allExistingDatesFull.every(isFull => isFull)) {
                    examDateInput.style.backgroundColor = '#ffebee';
                    showAlert('Please fill slots for existing dates first before choosing a new date.');
                    examDateInput.value = '';
                    return;
                }
            }
            
            examDateInput.style.backgroundColor = '';
            saveExamineeBtn.disabled = false; // Enable button only if date is valid
        }
    });
}

async function checkIfDateIsFull(date) {
    const examineesSnapshot = await getDocs(collection(db, 'freshmen_examinees'));
    const examineesOnDate = examineesSnapshot.docs.filter(doc => doc.data().examDate === date);
    return examineesOnDate.length >= 4; // 4 batches per day limit
}

async function getNextAvailableBatch(selectedDate) {
    const examineesSnapshot = await getDocs(collection(db, 'freshmen_examinees'));
    const examineesOnDate = examineesSnapshot.docs
        .filter(doc => doc.data().examDate === selectedDate)
        .map(doc => doc.data());

    // Find first available batch
    for (let i = 0; i < batchSchedules.length; i++) {
        const batchInUse = examineesOnDate.some(examinee => 
            examinee.examStartTime === batchSchedules[i].startTime && 
            examinee.room === batchSchedules[i].room
        );
        if (!batchInUse) {
            return {
                batchNumber: i + 1,
                ...batchSchedules[i]
            };
        }
    }
    return null;
}

idSelect.addEventListener('change', async () => {
    const selectedId = idSelect.value;
    const emailInput = document.getElementById('email');
    const fullNameInput = document.getElementById('fullName');
    
    if (selectedId) {
        const userDoc = await getDoc(doc(db, 'freshmen_approved_applicants', selectedId));
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

async function generateEntranceId() {
    if (deletedEntranceIds.length > 0) {
        return deletedEntranceIds.shift();
    }
    
    let numberPart;
    
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
    
    return `App${numberPart}`;
}

saveExamineeBtn.addEventListener('click', async () => {
    const id = idSelect.value;
    const email = document.getElementById('email').value;
    const fullName = document.getElementById('fullName').value;
    const examDate = document.getElementById('examDate').value;
    const entranceId = await generateEntranceId();

    if (id && email && fullName && examDate) {
        try {
            const batch = await getNextAvailableBatch(examDate);
            if (!batch) {
                showAlert('No available batches for this date. Please select another date.');
                return;
            }

            const qr = qrcode(0, 'L');
            qr.addData(entranceId);
            qr.make();
            const qrCodeDataUrl = qr.createDataURL(5);

            await setDoc(doc(db, 'freshmen_examinees', id), {
                email,
                fullName,
                batchNumber: batch.batchNumber,
                examDate,
                examStartTime: batch.startTime,
                examEndTime: batch.endTime,
                room: batch.room,
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
        showAlert('Please fill all required fields');
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

        const examineesSnapshot = await getDocs(collection(db, 'freshmen_examinees'));
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
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt me-2"></i>Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.addEventListener('click', () => showDeleteConfirmModal(examinee.id, examinee.email, examinee.entranceId));
        actionsCell.appendChild(deleteBtn);
    });

    document.getElementById('totalExamineesCount').textContent = examinees.length;
}

function showDeleteConfirmModal(id, email, entranceId) {
    confirmDeleteBtn.onclick = () => deleteExaminee(id, email, entranceId);
    deleteConfirmModal.show();
}

async function deleteExaminee(id, email, entranceId) {
    try {
        const resultQuery = query(collection(db, 'freshmen_examinees_result'), where('email', '==', email));
        const resultSnapshot = await getDocs(resultQuery);

        if (!resultSnapshot.empty) {
            let message = 'Cannot delete examinee. A result record exists for this email. Please delete the result record first before deleting the examinee.';
            showAlert(message);
            deleteConfirmModal.hide();
            return;
        }

        await deleteDoc(doc(db, 'freshmen_examinees', id));
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

document.getElementById('searchInput').addEventListener('input', (event) => {
    fetchExaminees(event.target.value);
});

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

fetchExaminees();