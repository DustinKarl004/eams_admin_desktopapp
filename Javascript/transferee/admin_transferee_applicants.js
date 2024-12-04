import { db} from '../firebase_config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Variables
let applicants = [];
let currentStatus = 'approved';

// Fetch applicant data
async function fetchApplicantData(searchTerm = '') {
    try {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('applicantsContainer').innerHTML = '';
        document.getElementById('totalApplicantsCount').textContent = 'Loading...';

        const applicantFormSnapshot = await getDocs(collection(db, 'transferee_applicant_form'));
        const approvedApplicantsSnapshot = await getDocs(collection(db, 'transferee_approved_applicants'));
        
        const applicantFormData = applicantFormSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        const approvedApplicants = approvedApplicantsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            dateApproved: doc.data().dateApproved ? doc.data().dateApproved.toDate() : null
        }));
        
        applicants = applicantFormData.map(data => {
            const approvedData = approvedApplicants.find(approved => approved.email === data.id);
            return { 
                ...data.applicant_info, 
                ...data.address_and_cn, 
                capturedImage: data.captured_image || null,
                status: approvedData ? 'APPROVED' : (data.captured_image ? 'COMPLETE' : 'INCOMPLETE'),
                uploadedAt: data.captured_image ? data.captured_image.uploaded_at : null,
                dateApproved: approvedData ? approvedData.dateApproved : null,
                id: data.id
            };
        });

        // Filter applicants based on the search term
        if (searchTerm) {
            const searchTermLower = searchTerm.toLowerCase();
            applicants = applicants.filter(applicant => {
                // Format different name combinations
                const formalFormat = `${applicant.last_name}, ${applicant.first_name} ${applicant.middle_name}`.toLowerCase();
                const naturalFormat = `${applicant.first_name} ${applicant.middle_name} ${applicant.last_name}`.toLowerCase();
                const shortFormat = `${applicant.first_name} ${applicant.last_name}`.toLowerCase();
                const lastFirstFormat = `${applicant.last_name} ${applicant.first_name}`.toLowerCase();
                const lastFirstMiddleFormat = `${applicant.last_name} ${applicant.first_name} ${applicant.middle_name}`.toLowerCase();
                
                // Check if search term matches any name format
                return formalFormat.includes(searchTermLower) ||
                       naturalFormat.includes(searchTermLower) ||
                       shortFormat.includes(searchTermLower) ||
                       lastFirstFormat.includes(searchTermLower) ||
                       lastFirstMiddleFormat.includes(searchTermLower) ||
                       // Also keep individual name part matching
                       applicant.last_name.toLowerCase().includes(searchTermLower) ||
                       applicant.first_name.toLowerCase().includes(searchTermLower) ||
                       applicant.middle_name.toLowerCase().includes(searchTermLower);
            });
        }
        // Sort applicants: approved first, then latest complete, then incomplete
        applicants.sort((a, b) => {
            if (a.status === 'APPROVED' && b.status !== 'APPROVED') return -1;
            if (b.status === 'APPROVED' && a.status !== 'APPROVED') return 1;
            if (a.status === 'APPROVED' && b.status === 'APPROVED') return b.dateApproved - a.dateApproved;
            if (a.status === 'COMPLETE' && b.status === 'COMPLETE') return b.uploadedAt - a.uploadedAt;
            if (a.status === 'COMPLETE') return -1;
            if (b.status === 'COMPLETE') return 1;
            return 0;
        });

        renderApplicantCards();
    } catch (error) {
        console.error("Error fetching applicants:", error);
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

// Render applicant cards
function renderApplicantCards() {
    const applicantsContainer = document.getElementById('applicantsContainer');
    applicantsContainer.innerHTML = '';

    const filteredApplicants = applicants.filter(applicant => {
        if (currentStatus === 'approved') return applicant.status === 'APPROVED';
        if (currentStatus === 'complete') return applicant.status === 'COMPLETE';
        if (currentStatus === 'incomplete') return applicant.status === 'INCOMPLETE';
        return true;
    });

    filteredApplicants.forEach(applicant => {
        const card = document.createElement('div');
        card.className = 'col-md-6 mb-4';
        card.innerHTML = `
            <div class="applicant-card">
                <h4 class="applicant-name">
                    <i class="fas fa-user-circle me-2"></i>
                    ${applicant.last_name}, ${applicant.first_name} ${applicant.middle_name}
                </h4>
                <div class="applicant-info-container">
                    <p class="applicant-info"><i class="fas fa-envelope"></i>Email: ${applicant.id}</p>
                    ${applicant.status === 'APPROVED' 
                        ? `<p class="applicant-info"><i class="fas fa-check-circle"></i>Approved at: ${applicant.dateApproved.toLocaleString()}</p>`
                        : applicant.status === 'COMPLETE'
                            ? `<p class="applicant-info"><i class="fas fa-clock"></i>Submitted at: ${new Date(applicant.uploadedAt).toLocaleString()}</p>`
                            : `<p class="applicant-info"><i class="fas fa-exclamation-circle"></i>Not yet submitted</p>`
                    }
                    <p class="applicant-info">
                        <i class="fas ${applicant.status === 'APPROVED' ? 'fa-check-circle' : (applicant.status === 'COMPLETE' ? 'fa-check-circle' : 'fa-exclamation-circle')}"></i>
                        Status: <span class="badge ${applicant.status === 'APPROVED' ? 'bg-primary' : (applicant.status === 'COMPLETE' ? 'bg-success' : 'bg-warning')}">${applicant.status}</span>
                    </p>
                </div>
                <div class="applicant-actions">
                    <a href="admin_transferee_alldataofapplicant.html?user_id=${encodeURIComponent(applicant.id)}" class="btn btn-see-more">See More</a>
                    ${applicant.status === 'APPROVED' ? `<a href="admin_transferee_checkstatus.html?user_id=${encodeURIComponent(applicant.id)}" class="btn btn-check-status">Check Status</a>` : ''}
                </div>
            </div>
        `;
        applicantsContainer.appendChild(card);
    });

    document.getElementById('totalApplicantsCount').textContent = filteredApplicants.length;
}

// Search applicants
document.getElementById('searchInput').addEventListener('input', (event) => {
    fetchApplicantData(event.target.value);
});

// Status filter buttons
document.querySelectorAll('.status-filter button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.status-filter button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        currentStatus = button.getAttribute('data-status');
        renderApplicantCards();
    });
});

// Initial fetch of applicant data
fetchApplicantData();
