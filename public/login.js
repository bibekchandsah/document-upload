const API_BASE = 'http://localhost:3000/api';

// DOM Elements
const githubTokenInput = document.getElementById('githubToken');
const tokenStatus = document.getElementById('tokenStatus');
const usernameDisplay = document.getElementById('usernameDisplay');
const repoSection = document.getElementById('repoSection');
const repoSelect = document.getElementById('repoSelect');
const newRepoInput = document.getElementById('newRepoInput');
const newRepoName = document.getElementById('newRepoName');
const repoPrivate = document.getElementById('repoPrivate');
const branchName = document.getElementById('branchName');
const loginBtn = document.getElementById('loginBtn');

// State
let ghToken = localStorage.getItem('gh_token');
let ghUser = localStorage.getItem('gh_user');
let ghRepo = localStorage.getItem('gh_repo');
let ghBranch = localStorage.getItem('gh_branch') || 'main';

// Initialization
async function init() {
    if (ghToken) {
        // Verify token silently
        try {
            const res = await fetch(`${API_BASE}/github/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: ghToken })
            });
            if (res.ok) {
                // Token is valid, redirect to app
                window.location.href = 'index.html';
            } else {
                // Token invalid, clear and stay here
                localStorage.removeItem('gh_token');
                ghToken = null;
            }
        } catch (e) {
            console.error(e);
            // Error validating, stay here
        }
    }
}

// --- Auth Logic ---
let tokenDebounce;
githubTokenInput.addEventListener('input', (e) => {
    const token = e.target.value.trim();
    clearTimeout(tokenDebounce);

    if (token.length > 10) {
        tokenDebounce = setTimeout(() => validateToken(token), 500);
    } else {
        resetLoginState();
    }
});

async function validateToken(token) {
    tokenStatus.className = 'status-icon'; // Reset
    tokenStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const res = await fetch(`${API_BASE}/github/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        if (res.ok) {
            const data = await res.json();
            tokenStatus.className = 'status-icon valid';
            tokenStatus.innerHTML = '';
            usernameDisplay.classList.remove('hidden');
            usernameDisplay.innerHTML = `<i class="fab fa-github"></i> ${data.username}`;

            ghUser = data.username;
            ghToken = token;

            loadRepos(token);
        } else {
            tokenStatus.className = 'status-icon invalid';
            tokenStatus.innerHTML = '';
            usernameDisplay.classList.add('hidden');
            repoSection.classList.add('hidden');
            loginBtn.disabled = true;
        }
    } catch (e) {
        console.error(e);
        tokenStatus.className = 'status-icon invalid';
        tokenStatus.innerHTML = '';
    }
}

async function loadRepos(token) {
    repoSelect.innerHTML = '<option>Loading...</option>';
    repoSection.classList.remove('hidden');

    try {
        const res = await fetch(`${API_BASE}/github/repos`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const repos = await res.json();

        repoSelect.innerHTML = '<option value="" disabled selected>Select a repository...</option>';
        repoSelect.innerHTML += '<option value="new">+ Create New Repository</option>';

        repos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.name;
            option.textContent = repo.name + (repo.private ? ' (Private)' : '');
            if (ghRepo === repo.name) option.selected = true;
            repoSelect.appendChild(option);
        });

        checkLoginReady();
    } catch (e) {
        console.error(e);
        repoSelect.innerHTML = '<option>Error loading repos</option>';
    }
}

repoSelect.addEventListener('change', () => {
    if (repoSelect.value === 'new') {
        newRepoInput.classList.remove('hidden');
    } else {
        newRepoInput.classList.add('hidden');
    }
    checkLoginReady();
});

function resetLoginState() {
    tokenStatus.className = 'status-icon';
    tokenStatus.innerHTML = '';
    usernameDisplay.classList.add('hidden');
    repoSection.classList.add('hidden');
    loginBtn.disabled = true;
}

function checkLoginReady() {
    const repoSelected = repoSelect.value && repoSelect.value !== 'Loading...';
    const newRepoValid = repoSelect.value === 'new' ? newRepoName.value.trim().length > 0 : true;

    if (ghToken && repoSelected && newRepoValid) {
        loginBtn.disabled = false;
    } else {
        loginBtn.disabled = true;
    }
}

newRepoName.addEventListener('input', checkLoginReady);

loginBtn.onclick = async () => {
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="btn-text">Connecting...</span>';
    loginBtn.disabled = true;

    try {
        let selectedRepo = repoSelect.value;
        const selectedBranch = branchName.value.trim() || 'main';

        if (selectedRepo === 'new') {
            // Create Repo
            const res = await fetch(`${API_BASE}/github/create-repo`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ghToken}`
                },
                body: JSON.stringify({
                    name: newRepoName.value.trim(),
                    private: repoPrivate.checked
                })
            });

            if (!res.ok) throw new Error('Failed to create repo');
            const data = await res.json();
            selectedRepo = data.name;
        }

        // Save Credentials
        localStorage.setItem('gh_token', ghToken);
        localStorage.setItem('gh_user', ghUser);
        localStorage.setItem('gh_repo', selectedRepo);
        localStorage.setItem('gh_branch', selectedBranch);

        // Redirect to main app
        window.location.href = 'index.html';

    } catch (e) {
        console.error(e);
        alert('Connection failed: ' + e.message);
        loginBtn.innerHTML = '<span class="btn-text">Connect to GitHub</span><i class="fas fa-arrow-right"></i>';
        loginBtn.disabled = false;
    }
};

init();
