import { db } from './firebase_config.js';
import { auth } from './firebase_config.js';
import { storage } from './firebase_config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, getDownloadURL, listAll } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";


// Logout functionality
document.getElementById("logoutBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
        await signOut(auth);
        window.location.href = "admin_rfid.html"; // Redirect to login page after logout
    } catch (error) {
        console.error("Error signing out:", error);
    }
});

// Improved dropdown menu functionality
document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const clickedDropdown = toggle.nextElementSibling;
        
        // Close all other dropdowns
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            if (menu !== clickedDropdown && menu.classList.contains('show')) {
                menu.classList.remove('show');
                menu.previousElementSibling.classList.remove('active');
            }
        });

        // Toggle the clicked dropdown
        clickedDropdown.classList.toggle('show');
        toggle.classList.toggle('active');
    });
});

// Function to get count from a collection
async function getCollectionCount(collectionName) {
    const querySnapshot = await getDocs(collection(db, collectionName));
    return querySnapshot.size;
}

// Function to create pie chart
async function createPieChart(chartId, loadingId, collectionPrefix) {
    const stages = ['Applicants', 'Approved Applicant', 'Schedule', 'Results', 'Upload Documents'];
    const data = [];
    const colors = ['#004b23', '#006400', '#008000', '#38b000', '#70e000'];
    const labels = [];

    for (const stage of stages) {
        let collectionName;
        
        switch(stage) {
            case 'Applicants':
                collectionName = `${collectionPrefix}_applicant_form`;
                break;
            case 'Approved Applicant':
                collectionName = `${collectionPrefix}_approved_applicants`;
                break;
            case 'Schedule':
                collectionName = `${collectionPrefix}_examinees`;
                break;
            case 'Results':
                collectionName = `${collectionPrefix}_examinees_result`;
                break;
            case 'Upload Documents':
                collectionName = `${collectionPrefix}_stepfour_upload_documents`;
                break;
        }

        const count = await getCollectionCount(collectionName);
        data.push(count);
        labels.push(`${stage} (${count})`);
    }

    document.getElementById(loadingId).style.display = 'none';
    const ctx = document.getElementById(chartId).getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors
            }]
        },
        options: {
            responsive: true,
            title: {
                display: true,
                text: `${collectionPrefix.charAt(0).toUpperCase() + collectionPrefix.slice(1)} Applicants Distribution`
            }
        }
    });
}

// Function to create bar chart
async function createBarChart() {
    const stages = ['Applicants', 'Approved Applicant', 'Schedule', 'Results', 'Upload Documents'];
    const freshmenData = [];
    const transfereeData = [];

    for (const stage of stages) {
        let freshmenCollectionName, transfereeCollectionName;
        
        switch(stage) {
            case 'Applicants':
                freshmenCollectionName = 'freshmen_applicant_form';
                transfereeCollectionName = 'transferee_applicant_form';
                break;
            case 'Approved Applicant':
                freshmenCollectionName = 'freshmen_approved_applicants';
                transfereeCollectionName = 'transferee_approved_applicants';
                break;
            case 'Schedule':
                freshmenCollectionName = 'freshmen_examinees';
                transfereeCollectionName = 'transferee_examinees';
                break;
            case 'Results':
                freshmenCollectionName = 'freshmen_examinees_result';
                transfereeCollectionName = 'transferee_examinees_result';
                break;
            case 'Upload Documents':
                freshmenCollectionName = 'freshmen_stepfour_upload_documents';
                transfereeCollectionName = 'transferee_stepfour_upload_documents';
                break;
        }

        const freshmenCount = await getCollectionCount(freshmenCollectionName);
        const transfereeCount = await getCollectionCount(transfereeCollectionName);
        freshmenData.push(freshmenCount);
        transfereeData.push(transfereeCount);
    }

    document.getElementById('barChartLoading').style.display = 'none';
    const ctx = document.getElementById('barChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stages,
            datasets: [
                {
                    label: 'Freshmen',
                    data: freshmenData,
                    backgroundColor: '#004b23'
                },
                {
                    label: 'Transferees',
                    data: transfereeData,
                    backgroundColor: '#008000'
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            title: {
                display: true,
                text: 'Freshmen vs Transferees by Stage'
            }
        }
    });
}

async function checkIfComplete(data) {
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

    for (const category of categories) {
        if (!data[category] || Object.keys(data[category]).length === 0) {
            return false;
        }
    }

    return true;
}

async function getNewApplicants() {
    const freshmenQuery = query(
        collection(db, 'freshmen_applicant_form'),
        orderBy('captured_image.uploaded_at', 'desc')
    );
    const transfereeQuery = query(
        collection(db, 'transferee_applicant_form'),
        orderBy('captured_image.uploaded_at', 'desc')
    );

    const [freshmenSnapshot, transfereeSnapshot] = await Promise.all([
        getDocs(freshmenQuery),
        getDocs(transfereeQuery)
    ]);

    const freshmenApprovedQuery = await getDocs(collection(db, 'freshmen_approved_applicants'));
    const transfereeApprovedQuery = await getDocs(collection(db, 'transferee_approved_applicants'));

    const approvedFreshmenEmails = new Set(freshmenApprovedQuery.docs.map(doc => doc.data().email));
    const approvedTransfereeEmails = new Set(transfereeApprovedQuery.docs.map(doc => doc.data().email));

    const freshmenApplicants = [];
    const transfereeApplicants = [];

    for (const doc of freshmenSnapshot.docs) {
        const data = doc.data();
        if (await checkIfComplete(data) && !approvedFreshmenEmails.has(doc.id)) {
            freshmenApplicants.push({
                id: doc.id,
                name: `${data.applicant_info.first_name} ${data.applicant_info.middle_name} ${data.applicant_info.last_name}`,
                email: doc.id,
                type: 'Freshmen',
                uploadedAt: new Date(data.captured_image.uploaded_at)
            });
        }
    }

    for (const doc of transfereeSnapshot.docs) {
        const data = doc.data();
        if (await checkIfComplete(data) && !approvedTransfereeEmails.has(doc.id)) {
            transfereeApplicants.push({
                id: doc.id,
                name: `${data.applicant_info.first_name} ${data.applicant_info.middle_name} ${data.applicant_info.last_name}`,
                email: doc.id,
                type: 'Transferee',
                uploadedAt: new Date(data.captured_image.uploaded_at)
            });
        }
    }

    return [...freshmenApplicants, ...transfereeApplicants];
}

async function getCapturedImage(email, type) {
    const folderPath = type === 'Freshmen' ? 'freshmen_captured_images' : 'transferee_captured_images';
    const imageFolderRef = ref(storage, `uploads/${folderPath}/${email}`);
    try {
        const imageList = await listAll(imageFolderRef);
        if (imageList.items.length > 0) {
            return await getDownloadURL(imageList.items[0]);
        }
    } catch (error) {
        console.error("Error fetching captured image:", error);
    }
    return null;
}

async function showNewApplicantsModal(applicants) {
    const modal = document.getElementById('newApplicantsModal');
    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = '';

    if (applicants.length === 0) {
        modalBody.innerHTML = '<p>No new applicants found.</p>';
    } else {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <div class="search-wrapper">
                <i class="fa fa-search search-icon"></i>
                <input type="text" id="searchInput" placeholder="Search applicants..." class="search-input">
            </div>
        `;
        modalBody.appendChild(searchContainer);

        const freshmenList = document.createElement('div');
        freshmenList.className = 'applicant-list';
        freshmenList.innerHTML = '<h3>Freshmen Applicants</h3>';
        const transfereeList = document.createElement('div');
        transfereeList.className = 'applicant-list';
        transfereeList.innerHTML = '<h3>Transferee Applicants</h3>';

        for (const applicant of applicants) {
            const listItem = document.createElement('div');
            listItem.className = 'applicant-item';
            
            const imageUrl = await getCapturedImage(applicant.email, applicant.type);
            const imageHtml = imageUrl ? `<img src="${imageUrl}" alt="Captured Image" style="width: 100px; height: 100px; object-fit: cover; border-radius: 50%;">` : '';

            listItem.innerHTML = `
                ${imageHtml}
                <div class="applicant-name">${applicant.name}</div>
                <div class="applicant-email">${applicant.email}</div>
                <div class="applicant-date">Submitted: ${applicant.uploadedAt.toLocaleString()}</div>
            `;
            if (applicant.type === 'Freshmen') {
                freshmenList.appendChild(listItem);
            } else {
                transfereeList.appendChild(listItem);
            }
        }

        modalBody.appendChild(freshmenList);
        modalBody.appendChild(transfereeList);

        document.getElementById('searchInput').addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const items = modalBody.querySelectorAll('.applicant-item');
            items.forEach(item => {
                const name = item.querySelector('.applicant-name').textContent.toLowerCase();
                const email = item.querySelector('.applicant-email').textContent.toLowerCase();
                if (name.includes(searchTerm) || email.includes(searchTerm)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    modal.style.display = 'block';
}

// Close modal functionality
const modal = document.getElementById('newApplicantsModal');
const closeBtn = modal.querySelector('.close');
const closeModalBtn = document.getElementById('closeModal');

closeBtn.onclick = () => modal.style.display = 'none';
closeModalBtn.onclick = () => modal.style.display = 'none';

window.onclick = (event) => {
    if (event.target == modal) {
        modal.style.display = 'none';
    }
};

// Create charts and show modal when the page loads
window.onload = async () => {
    createPieChart('freshmenPieChart', 'freshmenPieChartLoading', 'freshmen');
    createPieChart('transfereePieChart', 'transfereePieChartLoading', 'transferee');
    createBarChart();

    const newApplicants = await getNewApplicants();
    showNewApplicantsModal(newApplicants);
};
