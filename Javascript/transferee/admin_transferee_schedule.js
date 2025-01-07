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
    // Show loading message initially
    idSelect.innerHTML = '<option value="">Select an Examinee (Loading data, please wait...)</option>';

    const examineesSnapshot = await getDocs(collection(db, 'transferee_approved_applicants'));
    const scheduledUsersSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    const scheduledIds = new Set(scheduledUsersSnapshot.docs.map(doc => doc.id));

    // Group examinees by priority
    const priorityExaminees = [];
    const montalbamExaminees = [];

    for (const doc of examineesSnapshot.docs) {
        const id = doc.id;
        if (!scheduledIds.has(id)) {
            const userData = doc.data();
            const applicantData = await getApplicantData(userData.email);
            
            if (applicantData) {
                const isFromMontalban = checkIfFromMontalban(applicantData);
                const hasHonors = checkIfHasHonors(applicantData);

                if (isFromMontalban && hasHonors) {
                    priorityExaminees.push({
                        id,
                        email: userData.email,
                        fullName: userData.fullName,
                        approvedAt: userData.approvedAt ? new Date(userData.approvedAt) : new Date()
                    });
                } else if (isFromMontalban) {
                    montalbamExaminees.push({
                        id,
                        email: userData.email,
                        fullName: userData.fullName,
                        approvedAt: userData.approvedAt ? new Date(userData.approvedAt) : new Date()
                    });
                }
            }
        }
    }

    // Sort each group by approvedAt date
    const sortByApprovedAt = (a, b) => a.approvedAt - b.approvedAt;
    priorityExaminees.sort(sortByApprovedAt);
    montalbamExaminees.sort(sortByApprovedAt);

    // Clear loading message and add default option
    idSelect.innerHTML = '<option value="">Select an Examinee</option>';

    // Add options to select with optgroups
    if (priorityExaminees.length > 0) {
        const priorityGroup = document.createElement('optgroup');
        priorityGroup.label = 'Priority: From Montalban with Honors';
        priorityExaminees.forEach(examinee => {
            const option = document.createElement('option');
            option.value = examinee.id;
            option.textContent = `${examinee.email} - ${examinee.fullName}`;
            priorityGroup.appendChild(option);
        });
        idSelect.appendChild(priorityGroup);
    }

    if (montalbamExaminees.length > 0) {
        const montalbamGroup = document.createElement('optgroup');
        montalbamGroup.label = 'Priority: From Montalban';
        montalbamExaminees.forEach(examinee => {
            const option = document.createElement('option');
            option.value = examinee.id;
            option.textContent = `${examinee.email} - ${examinee.fullName}`;
            montalbamGroup.appendChild(option);
        });
        idSelect.appendChild(montalbamGroup);
    }

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
            showAlert('This date has reached the maximum number of examinees (8 examinees). Please select another date.');
            examDateInput.value = '';
        } else {
            // Check if there are any existing exam dates
            const examineesSnapshot = await getDocs(collection(db, 'transferee_examinees'));
            const existingDates = examineesSnapshot.docs
                .map(doc => doc.data().examDate)
                .filter(date => {
                    const examDate = new Date(date);
                    return examDate >= currentDate; // Only include non-past dates
                });
            
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

async function getApplicantData(email) {
    const docRef = doc(db, 'transferee_applicant_form', email);
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

async function checkIfDateIsFull(date) {
    const examineesSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    const examineesOnDate = examineesSnapshot.docs.filter(doc => doc.data().examDate === date);
    return examineesOnDate.length >= 8; // 8 examinees per day limit (2 per batch * 4 batches)
}

async function getNextAvailableBatch(selectedDate) {
    const examineesSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    const examineesOnDate = examineesSnapshot.docs
        .filter(doc => doc.data().examDate === selectedDate)
        .map(doc => doc.data());

    // Get the highest batch number from past dates
    const pastExaminees = examineesSnapshot.docs
        .filter(doc => {
            const examDate = new Date(doc.data().examDate);
            const selectedDateTime = new Date(selectedDate);
            return examDate < selectedDateTime;
        })
        .map(doc => doc.data());

    let highestPastBatch = 0;
    if (pastExaminees.length > 0) {
        highestPastBatch = Math.max(...pastExaminees.map(e => e.batchNumber));
    }

    // Get current date's highest batch number
    let currentDateHighestBatch = 0;
    if (examineesOnDate.length > 0) {
        currentDateHighestBatch = Math.max(...examineesOnDate.map(e => e.batchNumber));
    }

    // If there are past batches, start new numbering from the highest past batch
    const startingBatchNumber = highestPastBatch > 0 ? highestPastBatch + 1 : 1;

    // Find first available batch time slot
    for (let i = 0; i < batchSchedules.length; i++) {
        const examineesInBatch = examineesOnDate.filter(examinee => 
            examinee.examStartTime === batchSchedules[i].startTime && 
            examinee.room === batchSchedules[i].room
        );
        
        // If batch has less than 2 examinees, it's available
        if (examineesInBatch.length < 2) {
            // If this time slot is already in use, use its existing batch number
            const existingBatchForTimeSlot = examineesOnDate.find(e => 
                e.examStartTime === batchSchedules[i].startTime && 
                e.room === batchSchedules[i].room
            );

            const batchNumber = existingBatchForTimeSlot ? 
                existingBatchForTimeSlot.batchNumber : 
                startingBatchNumber + i;

            return {
                batchNumber,
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

            await setDoc(doc(db, 'transferee_examinees', id), {
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
        const resultQuery = query(collection(db, 'transferee_examinees_result'), where('email', '==', email));
        const resultSnapshot = await getDocs(resultQuery);

        if (!resultSnapshot.empty) {
            let message = 'Cannot delete examinee. A result record exists for this email. Please delete the result record first before deleting the examinee.';
            showAlert(message);
            deleteConfirmModal.hide();
            return;
        }

        // Delete the examinee document
        await deleteDoc(doc(db, 'transferee_examinees', id));

        // Delete the corresponding notification
        const notificationRef = doc(db, 'Notifications', email);
        const notificationSnap = await getDoc(notificationRef);
        
        if (notificationSnap.exists()) {
            const notifications = notificationSnap.data().list || [];
            const updatedNotifications = notifications.filter(notif => notif.category !== 'Schedule');
            
            if (updatedNotifications.length > 0) {
                await setDoc(notificationRef, { list: updatedNotifications });
            } else {
                await deleteDoc(notificationRef);
            }
        }

        deletedEntranceIds.push(entranceId);
        deletedEntranceIds.sort();
        deleteConfirmModal.hide();
        fetchExaminees();
        showAlert('Examinee and related notification deleted successfully.');
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