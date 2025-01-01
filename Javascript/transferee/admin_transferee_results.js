import { db } from '../firebase_config.js';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let results = [];
let currentSort = { field: null, direction: 'asc' };

// Add Result Modal functionality
const addResultBtn = document.getElementById('addResultBtn');
const addResultModal = new bootstrap.Modal(document.getElementById('addResultModal'));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const selectId = document.getElementById('selectId');

addResultBtn.addEventListener('click', () => {
    populateIdSelect();
    addResultModal.show();
});

async function populateIdSelect() {
    // Show loading message initially
    selectId.innerHTML = '<option value="">Select an ID (Loading data, please wait...)</option>';
    
    const examineesSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    const resultsSnapshot = await getDocs(collection(db, 'transferee_examinees_result'));
    const resultIds = new Set(resultsSnapshot.docs.map(doc => doc.id));

    // Get all entrance exam records
    const entranceExamSnapshot = await getDocs(collection(db, 'EntranceExam'));
    const entranceExamEmails = new Set(entranceExamSnapshot.docs.map(doc => doc.id));

    // Get all examinees with scores
    const examineesWithScores = [];
    for (const examDoc of examineesSnapshot.docs) {
        const id = examDoc.id;
        const examineeData = examDoc.data();
        
        if (!resultIds.has(id) && entranceExamEmails.has(examineeData.email)) {
            // Calculate score
            const examRef = doc(db, 'EntranceExam', examineeData.email);
            const examSnapshot = await getDoc(examRef);
            if (examSnapshot.exists()) {
                const examData = examSnapshot.data();
                let totalCorrect = 0;
                let totalQuestions = 0;

                for (const [subject, answers] of Object.entries(examData)) {
                    if (subject === 'completedSubjects') continue;
                    const questionRef = doc(db, "EntranceExamQuestion", subject);
                    const questionSnapshot = await getDoc(questionRef);
                    if (questionSnapshot.exists()) {
                        const questions = questionSnapshot.data();
                        for (const [qNum, userAnswer] of Object.entries(answers)) {
                            if (questions[qNum] && questions[qNum].correctAnswer === userAnswer) {
                                totalCorrect++;
                            }
                            totalQuestions++;
                        }
                    }
                }

                const percentage = ((totalCorrect / totalQuestions) * 100).toFixed(2);
                let priority = '';
                if (percentage >= 80) priority = '1st Priority (80-100%)';
                else if (percentage >= 61) priority = '2nd Priority (61-70%)';
                else if (percentage >= 50) priority = '3rd Priority (50-60%)';
                else priority = 'Below 50%';

                examineesWithScores.push({
                    id,
                    email: examineeData.email,
                    fullName: examineeData.fullName,
                    percentage: parseFloat(percentage),
                    priority
                });
            }
        }
    }

    // Sort by percentage descending
    examineesWithScores.sort((a, b) => b.percentage - a.percentage);

    // Group by priority
    const priorityGroups = {
        '1st Priority (80-100%)': [],
        '2nd Priority (61-70%)': [],
        '3rd Priority (50-60%)': [],
        'Below 50%': []
    };

    examineesWithScores.forEach(examinee => {
        priorityGroups[examinee.priority].push(examinee);
    });

    // Clear loading message and add default option
    selectId.innerHTML = '<option value="">Select an ID</option>';

    // Check if there are any higher priority students
    const has1stPriority = priorityGroups['1st Priority (80-100%)'].length > 0;
    const has2ndPriority = priorityGroups['2nd Priority (61-70%)'].length > 0;
    const has3rdPriority = priorityGroups['3rd Priority (50-60%)'].length > 0;

    // Add options to select with optgroups and disable lower priorities if needed
    if (has1stPriority) {
        // Only show 1st priority students
        const group = document.createElement('optgroup');
        group.label = '1st Priority (80-100%)';
        priorityGroups['1st Priority (80-100%)'].forEach(examinee => {
            const option = document.createElement('option');
            option.value = examinee.id;
            option.textContent = `${examinee.email} - ${examinee.fullName}`;
            group.appendChild(option);
        });
        selectId.appendChild(group);
    } else if (has2ndPriority) {
        // Show 2nd priority students
        const group = document.createElement('optgroup');
        group.label = '2nd Priority (61-70%)';
        priorityGroups['2nd Priority (61-70%)'].forEach(examinee => {
            const option = document.createElement('option');
            option.value = examinee.id;
            option.textContent = `${examinee.email} - ${examinee.fullName}`;
            group.appendChild(option);
        });
        selectId.appendChild(group);
    } else if (has3rdPriority) {
        // Show 3rd priority students
        const group = document.createElement('optgroup');
        group.label = '3rd Priority (50-60%)';
        priorityGroups['3rd Priority (50-60%)'].forEach(examinee => {
            const option = document.createElement('option');
            option.value = examinee.id;
            option.textContent = `${examinee.email} - ${examinee.fullName}`;
            group.appendChild(option);
        });
        selectId.appendChild(group);
    } else {
        // Show below 50% students
        const group = document.createElement('optgroup');
        group.label = 'Below 50%';
        priorityGroups['Below 50%'].forEach(examinee => {
            const option = document.createElement('option');
            option.value = examinee.id;
            option.textContent = `${examinee.email} - ${examinee.fullName}`;
            group.appendChild(option);
        });
        selectId.appendChild(group);
    }
}

selectId.addEventListener('change', async () => {
    const selectedId = selectId.value;
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const instituteInput = document.getElementById('institute');
    const courseInput = document.getElementById('course');
    const addResultSubmitBtn = document.getElementById('addResultSubmitBtn');
    const addModalLoadingIndicator = document.getElementById('addModalLoadingIndicator');
    
    // Reset form elements
    fullNameInput.value = '';
    emailInput.value = '';
    instituteInput.value = '';
    courseInput.value = '';
    addResultSubmitBtn.disabled = true;
    
    if (selectedId) {
        try {
            addModalLoadingIndicator.style.display = 'block';
            const examineeRef = doc(db, 'transferee_examinees', selectedId);
            const examineeSnapshot = await getDoc(examineeRef);
            if (examineeSnapshot.exists()) {
                const examineeData = examineeSnapshot.data();
                fullNameInput.value = examineeData.fullName || '';
                emailInput.value = examineeData.email || '';

                // Get exam score and course preferences
                const examRef = doc(db, 'EntranceExam', examineeData.email);
                const examSnapshot = await getDoc(examRef);
                if (examSnapshot.exists()) {
                    const examData = examSnapshot.data();
                    let totalCorrect = 0;
                    let totalQuestions = 0;

                    // Calculate score
                    for (const [subject, answers] of Object.entries(examData)) {
                        if (subject === 'completedSubjects') continue;
                        const questionRef = doc(db, "EntranceExamQuestion", subject);
                        const questionSnapshot = await getDoc(questionRef);
                        if (questionSnapshot.exists()) {
                            const questions = questionSnapshot.data();
                            for (const [qNum, userAnswer] of Object.entries(answers)) {
                                if (questions[qNum] && questions[qNum].correctAnswer === userAnswer) {
                                    totalCorrect++;
                                }
                                totalQuestions++;
                            }
                        }
                    }

                    const percentage = ((totalCorrect / totalQuestions) * 100).toFixed(2);

                    // Get course preferences
                    const applicantRef = doc(db, 'transferee_applicant_form', examineeData.email);
                    const applicantSnapshot = await getDoc(applicantRef);
                    if (applicantSnapshot.exists()) {
                        const courseData = applicantSnapshot.data().course;
                        const choices = [
                            courseData.first_choice,
                            courseData.second_choice, 
                            courseData.third_choice
                        ];

                        // Get current course counts
                        const courseCounts = {};
                        const resultsSnapshot = await getDocs(collection(db, 'transferee_examinees_result'));
                        resultsSnapshot.forEach(doc => {
                            const course = doc.data().course;
                            courseCounts[course] = (courseCounts[course] || 0) + 1;
                        });

                        let assignedCourse = null;
                        let assignedInstitute = '';

                        // Handle based on priority
                        if (percentage >= 80) {
                            // First priority can choose from their choices if slots available
                            for (const choice of choices) {
                                if ((courseCounts[choice] || 0) < 2) {
                                    assignedCourse = choice;
                                    break;
                                }
                            }
                        } else if (percentage >= 61 && percentage < 71) {
                            // Second priority - only if no first priority students pending
                            const firstPriorityPending = await checkPendingHigherPriority(80, 100);
                            if (!firstPriorityPending) {
                                for (const choice of choices) {
                                    if ((courseCounts[choice] || 0) < 2) {
                                        assignedCourse = choice;
                                        break;
                                    }
                                }
                            }
                        } else if (percentage >= 50 && percentage <= 60) {
                            // Third priority - only if no first/second priority students pending
                            const higherPriorityPending = await checkPendingHigherPriority(61, 100);
                            if (!higherPriorityPending) {
                                for (const choice of choices) {
                                    if ((courseCounts[choice] || 0) < 2) {
                                        assignedCourse = choice;
                                        break;
                                    }
                                }
                            }
                        } else {
                            // Below 50% - assign random available course if no higher priority students
                            const higherPriorityPending = await checkPendingHigherPriority(50, 100);
                            if (!higherPriorityPending) {
                                const availableCourses = getAllAvailableCourses(courseCounts);
                                if (availableCourses.length > 0) {
                                    assignedCourse = availableCourses[Math.floor(Math.random() * availableCourses.length)];
                                } else {
                                    showAlert('No available slots in any course at this time.');
                                    return;
                                }
                            }
                        }

                        // Set institute based on course
                        if (assignedCourse) {
                            if (['BSIT', 'BSCPE'].includes(assignedCourse)) {
                                assignedInstitute = 'ICS';
                            } else if (['BSEd-Sci', 'BEEd-G', 'BECEd', 'BTLEd-ICT', 'TCP'].includes(assignedCourse)) {
                                assignedInstitute = 'ITE';
                            } else if (['BSBA-HRM', 'BSEntrep'].includes(assignedCourse)) {
                                assignedInstitute = 'IBE';
                            }

                            instituteInput.value = assignedInstitute;
                            courseInput.value = assignedCourse;
                            
                            // Enable submit button if all fields are filled
                            addResultSubmitBtn.disabled = false;
                        } else {
                            showAlert('Please wait for higher priority students to be processed first.');
                            addResultSubmitBtn.disabled = true;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
            showAlert('An error occurred while loading the data. Please try again.');
        } finally {
            addModalLoadingIndicator.style.display = 'none';
        }
    }
});

async function checkPendingHigherPriority(minScore, maxScore) {
    const examineesSnapshot = await getDocs(collection(db, 'transferee_examinees'));
    const resultsSnapshot = await getDocs(collection(db, 'transferee_examinees_result'));
    const resultIds = new Set(resultsSnapshot.docs.map(doc => doc.id));

    for (const examDoc of examineesSnapshot.docs) {
        if (!resultIds.has(examDoc.id)) {
            const examRef = doc(db, 'EntranceExam', examDoc.data().email);
            const examSnapshot = await getDoc(examRef);
            if (examSnapshot.exists()) {
                const score = calculateScore(examSnapshot.data());
                if (score >= minScore && score <= maxScore) {
                    return true;
                }
            }
        }
    }
    return false;
}

function calculateScore(examData) {
    let totalCorrect = 0;
    let totalQuestions = 0;
    for (const [subject, answers] of Object.entries(examData)) {
        if (subject === 'completedSubjects') continue;
        // Add score calculation logic here
    }
    return ((totalCorrect / totalQuestions) * 100);
}

function getAllAvailableCourses(courseCounts) {
    const allCourses = ['BSIT', 'BSCPE', 'BSEd-Sci', 'BEEd-G', 'BECEd', 'BTLEd-ICT', 'TCP', 'BSBA-HRM', 'BSEntrep'];
    return allCourses.filter(course => (courseCounts[course] || 0) < 2);
}

window.addResult = async function() {
    const id = selectId.value;
    const email = document.getElementById('email').value;
    const fullName = document.getElementById('fullName').value;
    const institute = document.getElementById('institute').value;
    const course = document.getElementById('course').value;
    const addModalLoadingIndicator = document.getElementById('addModalLoadingIndicator');

    if (id && email && fullName && institute && course) {
        try {
            addModalLoadingIndicator.style.display = 'block';
            const resultRef = doc(db, 'transferee_examinees_result', id);
            await setDoc(resultRef, {
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
        } finally {
            addModalLoadingIndicator.style.display = 'none';
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
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.addEventListener('click', () => showDeleteConfirmModal(result.id, result.email));
        actionsCell.appendChild(deleteBtn);
    });

    document.getElementById('totalResultsCount').textContent = results.length;
}

function showDeleteConfirmModal(id, email) {
    document.getElementById('confirmDelete').onclick = () => deleteResult(id, email);
    deleteConfirmModal.show();
}

async function deleteResult(id, email) {
    try {
        // Delete the result document
        const resultRef = doc(db, 'transferee_examinees_result', id);
        await deleteDoc(resultRef);

        // Delete the corresponding notification
        const notificationRef = doc(db, 'Notifications', email);
        const notificationSnap = await getDoc(notificationRef);
        
        if (notificationSnap.exists()) {
            const notifications = notificationSnap.data().list || [];
            const updatedNotifications = notifications.filter(notif => notif.category !== 'Results');
            
            if (updatedNotifications.length > 0) {
                await setDoc(notificationRef, { list: updatedNotifications });
            } else {
                await deleteDoc(notificationRef);
            }
        }

        deleteConfirmModal.hide();
        fetchResults();
        showAlert('Result and related notification deleted successfully.');
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