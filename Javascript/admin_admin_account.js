import { db } from './firebase_config.js';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let adminAccounts = [];
let currentSort = { field: null, direction: 'asc' };

const addAdminAccountBtn = document.getElementById('addAdminAccountBtn');
const adminAccountModal = new bootstrap.Modal(document.getElementById('adminAccountModal'));
const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
const alertModal = new bootstrap.Modal(document.getElementById('alertModal'));
const accountKeyInput = document.getElementById('accountKey');
const saveAdminAccountBtn = document.getElementById('saveAdminAccount');
const confirmDeleteBtn = document.getElementById('confirmDelete');
const adminPasswordInput = document.getElementById('adminPassword');

addAdminAccountBtn.addEventListener('click', () => {
    if (adminAccounts.length >= 2) {
        showAlert('Maximum of 2 admin accounts allowed. Please delete an existing account to add a new one.');
        return;
    }
    clearAddModalInputs();
    adminAccountModal.show();
});

accountKeyInput.addEventListener('focus', () => {
    accountKeyInput.value = '';
    accountKeyInput.placeholder = 'Tap access card now...';
});

accountKeyInput.addEventListener('blur', () => {
    if (!accountKeyInput.value) {
        accountKeyInput.placeholder = 'Click here and tap access card';
    }
});

saveAdminAccountBtn.addEventListener('click', async () => {
    const adminName = document.getElementById('adminName').value;
    const accountKey = accountKeyInput.value;
    const email = document.getElementById('email').value;
    const adminPassword = adminPasswordInput.value;

    if (!adminName || !accountKey || !email || !adminPassword) {
        showAlert('Please fill all fields');
        return;
    }

    if (!isPasswordValid(adminPassword)) {
        showAlert('Password must be at least 8 characters long, include a number, an uppercase letter, a lowercase letter, and a special character.');
        return;
    }

    if (!isValidEmail(email)) {
        showAlert('Please enter a valid email address');
        return;
    }

    try {
        showSpinner(true);
        // Hash the account key before storing it (using a shorter hash)
        const hashedAccountKey = CryptoJS.SHA256(accountKey).toString().substring(0, 16);
        // Hash the password
        const hashedPassword = CryptoJS.SHA256(adminPassword).toString();

        const existingDoc = await getDoc(doc(db, 'admin_accounts', hashedAccountKey));
        if (existingDoc.exists()) {
            showAlert('An account with this access card already exists');
            return;
        }

        // Check if admin name or email already exists
        const adminAccountsSnapshot = await getDocs(collection(db, 'admin_accounts'));
        const existingAdminNames = adminAccountsSnapshot.docs.map(doc => doc.data().adminName);
        const existingEmails = adminAccountsSnapshot.docs.map(doc => doc.data().email);
        
        if (existingAdminNames.includes(adminName)) {
            showAlert('An account with this admin name already exists');
            return;
        }

        if (existingEmails.includes(email)) {
            showAlert('An account with this email already exists');
            return;
        }

        // Store the admin account in Firestore
        await setDoc(doc(db, 'admin_accounts', hashedAccountKey), {
            adminName: adminName,
            accountKey: hashedAccountKey,
            email: email,
            password: hashedPassword
        });
        
        adminAccountModal.hide();
        clearAddModalInputs();
        fetchAdminAccounts();
        showAlert('Admin account added successfully.');
    } catch (error) {
        console.error('Error saving admin account:', error);
        if (error.code === 'permission-denied') {
            showAlert('You do not have permission to add admin accounts.');
        } else if (error.code === 'unavailable') {
            showAlert('The server is currently unavailable. Please try again later.');
        } else {
            showAlert('An error occurred while saving the admin account. Please try again.');
        }
    } finally {
        showSpinner(false);
    }
});

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function clearAddModalInputs() {
    document.getElementById('adminName').value = '';
    accountKeyInput.value = '';
    accountKeyInput.placeholder = 'Click here and tap access card';
    document.getElementById('email').value = '';
    adminPasswordInput.value = '';
}

function isPasswordValid(password) {
    const regex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}$/;
    return regex.test(password);
}

function showAlert(message) {
    document.getElementById('alertMessage').textContent = message;
    alertModal.show();
}

function showSpinner(show) {
    const spinner = document.getElementById('spinner');
    if (spinner) {
        spinner.style.display = show ? 'inline-block' : 'none';
    }
}

async function fetchAdminAccounts(searchTerm = '') {
    try {
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('adminAccountTableBody').innerHTML = '';
        document.getElementById('totalAdminCount').textContent = 'Loading...';

        const adminAccountsSnapshot = await getDocs(collection(db, 'admin_accounts'));
        adminAccounts = adminAccountsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        if (searchTerm) {
            adminAccounts = adminAccounts.filter(account =>
                account.adminName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                account.email.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        sortAdminAccounts(currentSort.field, currentSort.direction);
        renderAdminAccountTable();
        updateAddButtonState();
    } catch (error) {
        console.error("Error fetching admin accounts:", error);
        if (error.code === 'permission-denied') {
            showAlert('You do not have permission to view admin accounts.');
        } else if (error.code === 'unavailable') {
            showAlert('The server is currently unavailable. Please try again later.');
        } else {
            showAlert('An error occurred while fetching admin accounts. Please try again.');
        }
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
}

function renderAdminAccountTable() {
    const tableBody = document.getElementById('adminAccountTableBody');
    tableBody.innerHTML = '';
    adminAccounts.forEach(account => {
        const row = tableBody.insertRow();
        row.insertCell().textContent = account.adminName;
        row.insertCell().textContent = account.email;
        
        const actionsCell = row.insertCell();
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt me-2"></i>Delete';
        deleteBtn.className = 'btn btn-sm btn-danger';
        deleteBtn.addEventListener('click', () => showDeleteConfirmModal(account.id, account.adminName));
        actionsCell.appendChild(deleteBtn);
    });

    document.getElementById('totalAdminCount').textContent = adminAccounts.length;
}

function showDeleteConfirmModal(id, adminName) {
    document.getElementById('deleteConfirmMessage').textContent = `Are you sure you want to delete the admin account for ${adminName}?`;
    document.getElementById('deletePassword').value = ''; // Clear the password field
    confirmDeleteBtn.onclick = () => deleteAdminAccount(id);
    deleteConfirmModal.show();
}

async function deleteAdminAccount(id) {
    try {
        showSpinner(true);
        await deleteDoc(doc(db, 'admin_accounts', id));
        deleteConfirmModal.hide();
        await fetchAdminAccounts();
        showAlert('Admin account deleted successfully.');
    } catch (error) {
        console.error('Error deleting admin account:', error);
        if (error.code === 'permission-denied') {
            showAlert('You do not have permission to delete admin accounts.');
        } else if (error.code === 'unavailable') {
            showAlert('The server is currently unavailable. Please try again later.');
        } else {
            showAlert('An error occurred while deleting the admin account. Please try again.');
        }
    } finally {
        showSpinner(false);
    }
}

document.getElementById('searchInput').addEventListener('input', (event) => {
    fetchAdminAccounts(event.target.value);
});

function sortAdminAccounts(field, direction) {
    adminAccounts.sort((a, b) => {
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
        sortAdminAccounts(currentSort.field, currentSort.direction);
        renderAdminAccountTable();
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

function updateAddButtonState() {
    addAdminAccountBtn.disabled = adminAccounts.length >= 2;
}

// Call fetchAdminAccounts when the DOM content is loaded
document.addEventListener('DOMContentLoaded', () => {
    fetchAdminAccounts();
});
