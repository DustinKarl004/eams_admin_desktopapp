import { db } from './firebase_config.js';
import {collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


        // Variables
        let users = [];
        let currentSort = { field: null, direction: 'asc' };
        const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));

        // Fetch user data
        async function fetchUserData(searchTerm = '') {
            try {
                document.getElementById('loadingIndicator').style.display = 'block';
                document.getElementById('userTableBody').innerHTML = '';
                document.getElementById('totalUsersCount').textContent = 'Loading...';

                const snapshot = await getDocs(collection(db, 'users'));
                users = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                // Filter users based on the search term
                if (searchTerm) {
                    users = users.filter(user =>
                        user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        user.email.toLowerCase().includes(searchTerm.toLowerCase())
                    );
                }

                sortUsers(currentSort.field, currentSort.direction);
                renderUserTable();
            } catch (error) {
                console.error("Error fetching users:", error);
                showAlert('An error occurred while fetching users. Please try again.');
            } finally {
                document.getElementById('loadingIndicator').style.display = 'none';
            }
        }

        // Render user table
        function renderUserTable() {
            const userTableBody = document.getElementById('userTableBody');
            userTableBody.innerHTML = '';

            users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.firstName}</td>
                    <td>${user.lastName}</td>
                    <td>${user.middleName || '-'}</td>
                    <td>${user.email}</td>
                    <td>
                        <button class="btn btn-warning btn-edit" onclick="openEditUserModal('${user.id}')">
                            <i class="fas fa-edit"></i> Update
                        </button>
                    </td>
                `;
                userTableBody.appendChild(row);
            });

            document.getElementById('totalUsersCount').textContent = users.length;
        }

        // Open edit user modal
        window.openEditUserModal = function(userId) {
            const user = users.find(u => u.id === userId);
            if (user) {
                document.getElementById('editUserId').value = user.id;
                document.getElementById('editFirstName').value = user.firstName;
                document.getElementById('editLastName').value = user.lastName;
                document.getElementById('editMiddleName').value = user.middleName || '';

                const editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
                editUserModal.show();
            }
        }

        // Confirm user edit
        window.confirmUserEdit = async function() {
            const userId = document.getElementById('editUserId').value;
            const firstName = document.getElementById('editFirstName').value.trim();
            const lastName = document.getElementById('editLastName').value.trim();
            const middleName = document.getElementById('editMiddleName').value.trim();

            if (!firstName || !lastName) {
                showAlert('Please fill in both First Name and Last Name. Middle Name is optional.');
                return;
            }

            try {
                await updateDoc(doc(db, 'users', userId), {
                    firstName,
                    lastName,
                    middleName
                });

                // Close modal and refresh user data
                const editUserModal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
                editUserModal.hide();
                fetchUserData();
                showAlert('User updated successfully.');
            } catch (error) {
                console.error("Error updating user:", error);
                showAlert('An error occurred while updating the user. Please try again.');
            }
        }

        // Search users
        document.getElementById('searchInput').addEventListener('input', (event) => {
            const searchTerm = event.target.value.trim();
            fetchUserData(searchTerm);
        });

        // Sort users
        function sortUsers(field, direction) {
            users.sort((a, b) => {
                if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
                if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Handle sorting
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (currentSort.field === field) {
                    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSort.field = field;
                    currentSort.direction = 'asc';
                }
                sortUsers(currentSort.field, currentSort.direction);
                renderUserTable();
                updateSortIcons();
            });
        });

        // Update sort icons
        function updateSortIcons() {
            document.querySelectorAll('th[data-sort] i.fas:not(.fa-user):not(.fa-envelope)').forEach(icon => {
                icon.className = 'fas fa-sort';
            });
            if (currentSort.field) {
                const th = document.querySelector(`th[data-sort="${currentSort.field}"]`);
                const icon = th.querySelector('i.fas:not(.fa-user):not(.fa-envelope)');
                icon.className = `fas fa-sort-${currentSort.direction === 'asc' ? 'up' : 'down'}`;
            }
        }

        // Show alert
        function showAlert(message) {
            document.getElementById('alertMessage').textContent = message;
            alertModal.show();
        }

        // Initial fetch of user data
        fetchUserData();