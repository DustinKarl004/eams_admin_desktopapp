import { db, storage } from '../firebase_config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, getDownloadURL, listAll } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Get the user_id from the URL parameters
const urlParams = new URLSearchParams(window.location.search);
const userId = urlParams.get('user_id');

if (userId) {
    fetchApplicantData(userId);
} else {
    console.log("No user_id provided in the URL.");
    hideLoadingIndicator();
}

async function fetchApplicantData(userId) {
    try {
        showLoadingIndicator();

        const categories = [
            'address_and_cn',
            'applicant_info',
            'course',
            'education',
            'family_income',
            'family_info',
            'guardian_info',
            'other_applicant_info',
            'parents_info',
            'proof_of_eligibility',
            'proof_of_residency',
            'sector_and_work_status',
            'captured_image'
        ];

        const docRef = doc(db, 'transferee_applicant_form', userId);
        const docSnap = await getDoc(docRef);
        
        const applicantData = {};

        if (docSnap.exists()) {
            const data = docSnap.data();
            categories.forEach(category => {
                applicantData[category] = data[category] || {};
            });
        }

        // Use the user_id as the email
        applicantData.authEmail = userId;

        renderApplicantInfo(applicantData);
    } catch (error) {
        console.error("Error fetching applicant data:", error);
    } finally {
        hideLoadingIndicator();
    }
}

function showLoadingIndicator() {
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('applicant-info').style.display = 'none';
}

function hideLoadingIndicator() {
    document.getElementById('loadingIndicator').style.display = 'none';
    document.getElementById('applicant-info').style.display = 'block';
}

function renderApplicantInfo(data) {
    const container = document.getElementById('applicant-info');
    const isComplete = data.captured_image && data.captured_image.image_url;
    const status = isComplete ? 'COMPLETE' : 'INCOMPLETE';
    const statusClass = isComplete ? 'bg-success' : 'bg-warning';
    const statusIcon = isComplete ? 'fa-check-circle' : 'fa-exclamation-circle';
    
    // Update the status badge
    const statusBadge = document.getElementById('status-badge');
    statusBadge.innerHTML = `
        <span class="badge ${statusClass} fs-6">
            <i class="fas ${statusIcon} me-1"></i>${status}
        </span>
    `;
    
    container.innerHTML = `
        <div class="applicant-container">
            <div class="row">
                <div class="col-md-6">
                    ${renderPersonalInfo(data)}
                </div>
                <div class="col-md-6">
                    ${renderContactInfo(data)}
                </div>
            </div>
            <div class="row mt-4">
                <div class="col-md-6">
                    ${renderProofOfResidency(data)}
                </div>
                <div class="col-md-6">
                    ${renderAdditionalInfo(data)}
                </div>
            </div>
            <div class="row mt-4">
                <div class="col-md-6">
                    ${renderSectorAndWorkStatus(data)}
                </div>
                <div class="col-md-6">
                    ${renderFamilyInfo(data)}
                </div>
            </div>
            <div class="row mt-4">
                <div class="col-md-6">
                    ${renderFinancialInfo(data)}
                </div>
                <div class="col-md-6">
                    ${renderGuardianInfo(data)}
                </div>
            </div>
            ${renderEducationalBackground(data)}
            ${renderFamilyMembers(data)}
            <div class="row mt-4">
                <div class="col-md-4">
                    ${renderProofOfEligibility(data)}
                </div>
                <div class="col-md-4">
                    ${renderCourseSelection(data)}
                </div>
                <div class="col-md-4">
                    ${renderCapturedImages(data)}
                </div>
            </div>
        </div>
    `;
}

function renderPersonalInfo(data) {
    const info = data.applicant_info || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-user-circle me-2"></i>Personal Information
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-user-circle me-2"></i>Personal Information
        </div>
        <p class="info-item"><i class="fas fa-user"></i>${info.last_name || ''}, ${info.first_name || ''} ${info.middle_name || ''}</p>
        <p class="info-item"><i class="fas fa-envelope"></i>${data.authEmail || 'Email not available'}</p>
        <p class="info-item"><i class="fas fa-id-card"></i>LRN: ${info.lrn || ''}</p>
        <p class="info-item"><i class="fas fa-birthday-cake"></i>${info.dob || ''}</p>
        <p class="info-item"><i class="fas fa-map-marker-alt"></i>${info.place_of_birth || ''}</p>
        <p class="info-item"><i class="fas fa-venus-mars"></i>${info.sex || ''}</p>
    `;
}

function renderContactInfo(data) {
    const info = data.address_and_cn || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-address-book me-2"></i>Contact Information
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-address-book me-2"></i>Contact Information
        </div>
        <p class="info-item"><i class="fas fa-map-marked-alt"></i>${info.address_line_1 || ''}, ${info.address_line_2 || ''}, ${info.barangay || ''}, ${info.municipality || ''}, ${info.province || ''}</p>
        <p class="info-item"><i class="fas fa-phone"></i>${info.contact_number || ''}</p>
    `;
}

function renderProofOfResidency(data) {
    const info = data.proof_of_residency || {};
    const fileUrls = info.file_urls || [];
    if (Object.keys(info).length === 0 && fileUrls.length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-file-contract me-2"></i>Proof of Residency
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-file-contract me-2"></i>Proof of Residency
        </div>
        <p class="info-item"><i class="fas fa-file-alt"></i>${info.document_type || ''}</p>
        <p class="info-item"><i class="fas fa-file-alt"></i>Number of files: ${info.files_count || fileUrls.length}</p>
    ${fileUrls.map((url, index) => `
        <p class="info-item">
            <i class="fas fa-file"></i>
            <a href="${url}" target="_blank">View File ${index + 1}</a>
        </p>
    `).join('')}            `;
}

function renderAdditionalInfo(data) {
    const info = data.other_applicant_info || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-info-circle me-2"></i>Additional Information
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-info-circle me-2"></i>Additional Information
        </div>
        <p class="info-item"><i class="fas fa-flag"></i>${info.citizenship || ''}</p>
        <p class="info-item"><i class="fas fa-venus-mars"></i>${info.gender || ''}</p>
        <p class="info-item"><i class="fas fa-pray"></i>${info.religion || ''}</p>
        <p class="info-item"><i class="fas fa-ring"></i>${info.civil_status || ''}</p>
    `;
}

function renderSectorAndWorkStatus(data) {
    const info = data.sector_and_work_status || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-briefcase me-2"></i>Sector and Work Status
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-briefcase me-2"></i>Sector and Work Status
        </div>
        <p class="info-item"><i class="fas fa-industry"></i>${info.sector || ''}</p>
        <p class="info-item"><i class="fas fa-user-tie"></i>${info.work_status || ''}</p>
    `;
}

function renderFamilyInfo(data) {
    const info = data.parents_info || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-users me-2"></i>Family Information
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-users me-2"></i>Family Information
        </div>
        <p class="info-item"><i class="fas fa-male"></i>Father: ${info.father_last_name || ''}, ${info.father_first_name || ''} ${info.father_middle_name || ''}</p>
        <p class="info-item"><i class="fas fa-birthday-cake"></i>Father's Age: ${info.father_age || ''}</p>
        <p class="info-item"><i class="fas fa-briefcase"></i>Father's Occupation: ${info.father_occupation || ''}</p>
        <p class="info-item"><i class="fas fa-female"></i>Mother: ${info.mother_maiden_last_name || ''}, ${info.mother_first_name || ''} ${info.mother_maiden_middle_name || ''}</p>
        <p class="info-item"><i class="fas fa-birthday-cake"></i>Mother's Age: ${info.mother_age || ''}</p>
        <p class="info-item"><i class="fas fa-briefcase"></i>Mother's Occupation: ${info.mother_occupation || ''}</p>
    `;
}

function renderFinancialInfo(data) {
    const info = data.family_income || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-money-bill-wave me-2"></i>Financial Information
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-money-bill-wave me-2"></i>Financial Information
        </div>
        <p class="info-item"><i class="fas fa-coins"></i>Monthly Income: ${info.family_monthly_income || ''}</p>
        <p class="info-item"><i class="fas fa-check-circle"></i>4Ps Beneficiary: ${info.four_ps_beneficiary || ''}</p>
        <p class="info-item"><i class="fas fa-list-ul"></i>Listahan: ${info.listahan || ''}</p>
    `;
}

function renderGuardianInfo(data) {
    const info = data.guardian_info || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-user-shield me-2"></i>Guardian Information
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-user-shield me-2"></i>Guardian Information
        </div>
        <p class="info-item"><i class="fas fa-user"></i>${info.guardian_last_name || ''}, ${info.guardian_first_name || ''} ${info.guardian_middle_name || ''}</p>
        <p class="info-item"><i class="fas fa-home"></i>Residing with Applicant: ${info.is_guardian_residing_on_same_home_address ? 'Yes' : 'No'}</p>
    `;
}

function renderEducationalBackground(data) {
    const info = data.education || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="row mt-4">
                <div class="col-md-12">
                    <div class="section-title" style="color: red;">
                        <i class="fas fa-graduation-cap me-2"></i>Educational Background
                    </div>
                    <p class="info-item">No information available</p>
                </div>
            </div>
        `;
    }
    return `
        <div class="row mt-4">
            <div class="col-md-12">
                <div class="section-title">
                    <i class="fas fa-graduation-cap me-2"></i>Educational Background
                </div>
                <div class="row">
                    <div class="col-md-4">
                        <h5 class="subsection-title">Elementary</h5>
                        <p class="info-item"><i class="fas fa-school"></i>${info.elementary_name || ''}</p>
                        <p class="info-item"><i class="fas fa-map-marker-alt"></i>${info.elementary_address || ''}</p>
                        <p class="info-item"><i class="fas fa-calendar-alt"></i>${info.elementary_year || ''}</p>
                        <p class="info-item"><i class="fas fa-award"></i>${info.elementary_honors || ''}</p>
                    </div>
                    <div class="col-md-4">
                        <h5 class="subsection-title">Junior High School</h5>
                        <p class="info-item"><i class="fas fa-school"></i>${info.junior_high_name || ''}</p>
                        <p class="info-item"><i class="fas fa-map-marker-alt"></i>${info.junior_high_address || ''}</p>
                        <p class="info-item"><i class="fas fa-calendar-alt"></i>${info.junior_high_year || ''}</p>
                        <p class="info-item"><i class="fas fa-award"></i>${info.junior_high_honors || ''}</p>
                    </div>
                    <div class="col-md-4">
                        <h5 class="subsection-title">Senior High School</h5>
                        <p class="info-item"><i class="fas fa-school"></i>${info.senior_high_name || ''}</p>
                        <p class="info-item"><i class="fas fa-map-marker-alt"></i>${info.senior_high_address || ''}</p>
                        <p class="info-item"><i class="fas fa-calendar-alt"></i>${info.senior_high_year || ''}</p>
                        <p class="info-item"><i class="fas fa-award"></i>${info.senior_high_honors || ''}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderFamilyMembers(data) {
    const info = data.family_info || {};
    const members = info.family_members || [];
    if (Object.keys(info).length === 0 && members.length === 0) {
        return `
            <div class="row mt-4">
                <div class="col-md-12">
                    <div class="section-title" style="color: red;">
                        <i class="fas fa-users me-2"></i>Family Members Information
                    </div>
                    <p class="info-item">No information available</p>
                </div>
            </div>
        `;
    }
    return `
        <div class="row mt-4">
            <div class="col-md-12">
                <div class="section-title">
                    <i class="fas fa-users me-2"></i>Family Members Information
                </div>
                <p class="info-item"><i class="fas fa-users"></i>Total Household Members: ${info.household_member_count || members.length}</p>
                <div class="row">
                    ${members.map((member, index) => `
                        <div class="col-md-4 mb-3">
                            <h6 class="family-member-title">Family Member ${index + 1}</h6>
                            <p class="info-item"><i class="fas fa-user"></i>Name: ${member.lastName || ''}, ${member.firstName || ''} ${member.middleName || ''}</p>
                            <p class="info-item"><i class="fas fa-venus-mars"></i>Sex: ${member.sex || ''}</p>
                            <p class="info-item"><i class="fas fa-ring"></i>Civil Status: ${member.civilStatus || ''}</p>
                            <p class="info-item"><i class="fas fa-users"></i>Relation: ${member.relation || ''}</p>
                            <p class="info-item"><i class="fas fa-graduation-cap"></i>Education: ${member.education || ''}</p>
                            <p class="info-item"><i class="fas fa-briefcase"></i>Occupation: ${member.occupation || ''}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderProofOfEligibility(data) {
    const info = data.proof_of_eligibility || {};
    const fileUrls = info.file_urls || [];
    if (Object.keys(info).length === 0 && fileUrls.length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-file-alt me-2"></i>Proof of Eligibility
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
    <div class="section-title">
        <i class="fas fa-file-alt me-2"></i>Proof of Eligibility
    </div>
    <p class="info-item"><i class="fas fa-file-alt"></i>Number of files: ${info.files_count || fileUrls.length}</p>
    ${fileUrls.map((url, index) => `
        <p class="info-item">
            <i class="fas fa-file"></i>
            <a href="${url}" target="_blank">View File ${index + 1}</a>
        </p>
    `).join('')}
    `;
}

function renderCourseSelection(data) {
    const info = data.course || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-list-ol me-2"></i>Course Selection
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-list-ol me-2"></i>Course Selection
        </div>
        <p class="info-item"><i class="fas fa-star"></i>First Choice: ${info.first_choice || ''}</p>
        <p class="info-item"><i class="fas fa-star-half-alt"></i>Second Choice: ${info.second_choice || ''}</p>
        <p class="info-item"><i class="far fa-star"></i>Third Choice: ${info.third_choice || ''}</p>
    `;
}

function renderCapturedImages(data) {
    const info = data.captured_image || {};
    if (Object.keys(info).length === 0) {
        return `
            <div class="section-title" style="color: red;">
                <i class="fas fa-camera me-2"></i>Captured Images
            </div>
            <p class="info-item">No information available</p>
        `;
    }
    return `
        <div class="section-title">
            <i class="fas fa-camera me-2"></i>Captured Images
        </div>
        ${info.image_url ? `
            <p class="info-item">
                <i class="fas fa-image"></i>
                <a href="${info.image_url}" target="_blank">View Image</a>
            </p>
        ` : ''}
        ${info.uploaded_at ? `
            <p class="info-item">
                <i class="fas fa-calendar-alt"></i>
                Uploaded at: ${new Date(info.uploaded_at).toLocaleString()}
            </p>
        ` : ''}
        ${!info.image_url && !info.uploaded_at ? `
            <p class="info-item">No image uploaded</p>
        ` : ''}
    `;
}

async function renderFileLinks(folder, userId) {
    if (!userId) return 'No files uploaded';
    try {
        const folderRef = ref(storage, `uploads/${folder}/${userId}`);
        const fileList = await listAll(folderRef);
        if (fileList.items.length === 0) return 'No files uploaded';
        return fileList.items.map(item => `
            <p class="info-item">
                <i class="fas fa-file"></i>
                <a href="#" onclick="downloadFile('${folder}', '${userId}', '${item.name}'); return false;">
                    ${item.name}
                </a>
            </p>
        `).join('');
    } catch (error) {
        console.error("Error listing files:", error);
        return 'Error loading files';
    }
}

window.downloadFile = async function(folder, userId, fileName) {
    try {
        const storageRef = ref(storage, `uploads/${folder}/${userId}/${fileName}`);
        const url = await getDownloadURL(storageRef);
        window.open(url, '_blank');
    } catch (error) {
        console.error("Error downloading file:", error);
        alert("Error downloading file. Please try again.");
    }
};
