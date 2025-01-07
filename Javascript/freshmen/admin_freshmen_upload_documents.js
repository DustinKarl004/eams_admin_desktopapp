import { db } from '../firebase_config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

  // Variables
  let examinees = [];

  // Fetch examinee data
  async function fetchExamineeData(searchTerm = '') {
      try {
          document.getElementById('loadingIndicator').style.display = 'block';
          document.getElementById('examineesContainer').innerHTML = '';
          document.getElementById('totalExamineesCount').textContent = 'Loading...';

          const examineesSnapshot = await getDocs(collection(db, 'freshmen_examinees_result'));
          const uploadDocumentsSnapshot = await getDocs(collection(db, 'freshmen_stepfour_upload_documents'));
          
          examinees = examineesSnapshot.docs.map(doc => ({
              email: doc.data().email,
              fullName: doc.data().fullName,
              ...doc.data()
          }));

          const uploadDocuments = uploadDocumentsSnapshot.docs.reduce((acc, doc) => {
              acc[doc.id] = doc.data();
              return acc;
          }, {});

          examinees = examinees.map(examinee => ({
              ...examinee,
              uploadInfo: uploadDocuments[examinee.email] || {}
          }));

          // Filter examinees based on the search term
          if (searchTerm) {
              examinees = examinees.filter(examinee =>
                  examinee.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  examinee.email.toLowerCase().includes(searchTerm.toLowerCase())
              );
          }

          renderExamineeCards();
      } catch (error) {
          console.error("Error fetching examinees:", error);
      } finally {
          document.getElementById('loadingIndicator').style.display = 'none';
      }
  }

  // Render examinee cards
  function renderExamineeCards() {
      const examineesContainer = document.getElementById('examineesContainer');
      examineesContainer.innerHTML = '';

      examinees.forEach(examinee => {
          const card = document.createElement('div');
          card.className = 'col-md-6 mb-4';
          card.innerHTML = `
              <div class="applicant-card">
                  <h4 class="applicant-name">
                      <i class="fas fa-user-circle me-2"></i>
                      ${examinee.fullName}
                  </h4>
                  <p class="applicant-info"><i class="fas fa-envelope"></i>Email: ${examinee.email}</p>
                  ${renderUploadedDocuments(examinee.uploadInfo)}
                  ${renderConfirmButton(examinee)}
              </div>
          `;
          examineesContainer.appendChild(card);
      });

      document.getElementById('totalExamineesCount').textContent = examinees.length;
  }

  function renderUploadedDocuments(info) {
      const fileUrls = info.file_urls || [];
      if (Object.keys(info).length === 0 && fileUrls.length === 0) {
          return `
              <p class="applicant-info" style="color: red;"><i class="fas fa-file-alt"></i>No documents uploaded</p>
          `;
      }
      return `
      <p class="applicant-info"><i class="fas fa-file-alt"></i>Number of files: ${info.files_count || fileUrls.length}</p>
      ${fileUrls.map((url, index) => `
          <p class="applicant-info">
              <i class="fas fa-file"></i>
              <a href="${url}" target="_blank">View File ${index + 1}</a>
          </p>
      `).join('')}
      `;
  }

  function renderConfirmButton(examinee) {
      if (!examinee.uploadInfo || Object.keys(examinee.uploadInfo).length === 0) {
          return '';
      }

      const isConfirmed = examinee.uploadInfo.confirmed;
      const buttonClass = isConfirmed ? 'confirm-btn confirmed' : 'confirm-btn';
      const buttonText = isConfirmed ? 'Confirmed' : 'Confirm Documents';
      const buttonDisabled = isConfirmed ? 'disabled' : '';

      return `
          <div class="mt-3">
              <button 
                  class="${buttonClass}"
                  onclick="confirmDocuments('${examinee.email}', '${examinee.fullName}')"
                  ${buttonDisabled}
              >
                  ${buttonText}
              </button>
              ${isConfirmed ? '<p class="confirmed-status">Documents have been confirmed</p>' : ''}
          </div>
      `;
  }

  // Confirm documents function
  window.confirmDocuments = async function(email, fullName) {
      try {
          console.log(`Confirming documents for ${email}`);
          const docRef = doc(db, 'freshmen_stepfour_upload_documents', email);
          await updateDoc(docRef, {
              confirmed: true
          });
          
          console.log(`Confirmed documents for ${email}`);

          // Send email notification
          const templateParams = {
              to_email: email,
              to_name: fullName,
              message: 'Your uploaded documents have been confirmed. Please wait for further instructions regarding your enrollment process.'
          };

          emailjs.send('service_3j9xxep', 'template_d3q9lfw', templateParams)
              .then(function(response) {
                  console.log('Document confirmation email sent successfully:', response);
              }, function(error) {
                  console.error('Document confirmation email failed:', error);
              });
          
          // Refresh the data to show updated status
          await fetchExamineeData(document.getElementById('searchInput').value);
          
      } catch (error) {
          console.error("Error confirming documents:", error);
          alert("Failed to confirm documents. Please try again.");
      }
  }

  // Search examinees
  document.getElementById('searchInput').addEventListener('input', (event) => {
      fetchExamineeData(event.target.value);
  });

  // Initial fetch of examinee data
  fetchExamineeData();
