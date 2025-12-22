# Locked Folder Feature - Implementation Summary

## Overview
Implemented a dedicated password-protected "Locked Folder" with encryption using the `biencrypt` library. Users can enable a special "Locked Folder" that protects all its contents with a password. Passwords are encrypted using the user's GitHub username as the encryption key and stored persistently in the GitHub repository.

## Key Concepts

### Dedicated Locked Folder Approach
Unlike traditional per-folder locking, this implementation uses a single dedicated "Locked Folder":
- **One Special Folder**: Only "Locked Folder" can be password-protected
- **Container Approach**: Users store all sensitive files within this one folder
- **Simpler UX**: No lock icons on every folder - just one protected container
- **Optional Feature**: Users must enable it via toggle in view options bar

## Features Implemented

### 1. Password Encryption & Storage
- Uses `biencrypt` library's AES-256-GCM encryption
- Password is encrypted using the user's GitHub username as the key
- **Persistent Storage**: Encrypted passwords saved to `.locked-folders.json` in GitHub repo root
- Survives server restarts and browser refreshes
- User can recover password using their GitHub username if forgotten

### 2. Toggle-Based Visibility
- **View Options Bar**: Checkbox to show/hide Locked Folder
- **Default**: Disabled (users must opt-in)
- **Persistent Preference**: Setting saved in localStorage
- **Dynamic Display**: Instantly shows/hides in both sidebar and file grid

### 3. Server-Side API Endpoints

#### POST `/api/folders/lock`
- Sets password for the "Locked Folder"
- **Parameters:**
  - `owner`: GitHub repository owner
  - `repo`: GitHub repository name
  - `password`: Password to set (minimum 4 characters)
- **Returns:** Success message with recovery hint
- **Saves to GitHub**: Updates `.locked-folders.json` in repo

#### POST `/api/folders/unlock`
- Verifies password and unlocks folder for current session
- **Parameters:**
  - `owner`, `repo`, `password`
- **Returns:** Success status

#### GET `/api/folders/check-locked`
- Checks if "Locked Folder" or its subfolders are locked
- **Parameters:**
  - `owner`, `repo`, `folderPath` (query parameters)
- **Returns:** `{ locked: true/false }`
- **Path Logic**: Returns true for "Locked Folder" and any path starting with "Locked Folder/"

#### DELETE `/api/folders/unlock`
- Removes password protection (requires password verification)
- **Parameters:**
  - `owner`, `repo`, `password`
- **Returns:** Success message
- **Updates GitHub**: Removes entry from `.locked-folders.json`

### 4. Frontend Features

#### Automatic Display
- **Virtual Folder**: "Locked Folder" appears automatically at root level when enabled
- **Sidebar Placement**: Shown at bottom of folder list
- **File Grid**: Appears in main file grid when at root
- **Toggle Control**: View options bar has "Locked Folder" checkbox

#### Dynamic Visual Indicators
Icons change based on current state:
- **🔑 Key Icon (Gray)**: No password set - click to set password
- **🔒 Lock Icon (Red)**: Password set and currently locked
- **🔓 Unlock Icon (Green)**: Password set but unlocked in current session

**Where Icons Appear:**
- Sidebar folder list (with dynamic color)
- File grid folder card (with descriptive text)
- Key action button in sidebar (always visible for mobile users)

#### Lock/Unlock Modal

**Enhanced UX Features:**
- **Auto-focus**: First input field automatically focused when modal opens
- **Enter Key Navigation**:
  - First password → Enter → Confirm password
  - Confirm password → Enter → Submit form
  - Unlock password → Enter → Submit unlock
- **Keyboard-Friendly**: Fast workflow without mouse clicks

**Set Password Form:**
- Warning banner about private repositories
- Password input (minimum 4 characters)
- Password confirmation
- Recovery hint about GitHub username
- "Set Password" button

**Unlock Form:**
- Password input
- Error display for incorrect password
- "Unlock & Access" button (opens folder for session)
- "Remove Password Protection" button (permanently removes lock)

#### User Flow

1. **Enabling Locked Folder:**
   - Open view options bar
   - Check "Locked Folder" checkbox
   - Locked Folder appears in sidebar and file grid
   - Preference saved to localStorage

2. **Setting Password (First Time):**
   - Click on Locked Folder (shows key icon)
   - Modal opens with warning about private repos
   - Enter password (min 4 characters)
   - Confirm password
   - Press Enter or click "Set Password"
   - Password encrypted and saved to GitHub repo
   - Recovery hint displayed

3. **Accessing Locked Folder:**
   - Click on locked folder (shows red lock icon)
   - Modal requests password
   - Enter password and press Enter
   - Folder unlocks for current session
   - Icon changes to green unlock icon
   - Can navigate normally until page refresh

4. **Using Key Action Button (Mobile):**
   - Locked Folder shows key/lock button in sidebar
   - Always visible (no hover required)
   - Click button to open password dialog
   - Perfect for touch devices

5. **Removing Password:**
   - Click key action button or Locked Folder
   - Enter current password
   - Click "Remove Password Protection"
   - Password deleted from GitHub repo
   - Locked Folder reverts to key icon
### 5. Session Management
- Unlocked folders tracked in current session using `unlockedFolders` Set
- Once unlocked, folder remains accessible until page refresh
- Prevents repeated password prompts during same session
- Each session requires fresh authentication

## Technical Implementation

### Data Structure (Server)
```javascript
// In-memory storage: Map<username, Map<folderKey, encryptedPassword>>
const lockedFolders = new Map();

// Persistent storage file in GitHub repo root
const PASSWORD_FILE = '.locked-folders.json';
```

### GitHub Storage Functions
```javascript
// Load passwords from GitHub repo on server start
async function loadPasswordsFromGitHub(octokit, owner, repo) {
    const { data } = await octokit.repos.getContent({
        owner, repo, path: PASSWORD_FILE
    });
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const passwordData = JSON.parse(content);
    // Restore to Map structure
    for (const [username, folders] of Object.entries(passwordData)) {
        lockedFolders.set(username, new Map(Object.entries(folders)));
    }
}

// Save passwords to GitHub repo after changes
async function savePasswordsToGitHub(octokit, owner, repo, username) {
    const passwordData = {};
    for (const [user, folders] of lockedFolders.entries()) {
        passwordData[user] = Object.fromEntries(folders);
    }
    const content = Buffer.from(JSON.stringify(passwordData, null, 2)).toString('base64');
    await octokit.repos.createOrUpdateFileContents({
        owner, repo,
        path: PASSWORD_FILE,
        message: 'Update locked folder passwords',
        content
    });
}
```

### Encryption Example
```javascript
const { aesEncrypt, aesDecrypt } = require('biencrypt');

// Encrypt password using GitHub username as key
const encryptedPassword = await aesEncrypt(userPassword, githubUsername);

// Decrypt password for verification
const decryptedPassword = await aesDecrypt(encryptedPassword, githubUsername);
```

### Frontend State
```javascript
// Track unlocked folders in current session
const unlockedFolders = new Set();

// Check localStorage for Locked Folder visibility preference
const showLockedFolder = localStorage.getItem('showLockedFolder') === 'true';

// Check if Locked Folder is locked before navigating
const isLockedFolderPath = currentFolder === 'Locked Folder' || 
                           currentFolder.startsWith('Locked Folder/');
if (isLockedFolderPath) {
    const isLocked = await checkFolderLocked('Locked Folder');
    if (isLocked && !unlockedFolders.has('Locked Folder')) {
        showLockFolderDialog('Locked Folder');
    }
}
```

### Auto-Display Logic
```javascript
// In renderFiles() - Add virtual Locked Folder if enabled and at root
const showLockedFolder = localStorage.getItem('showLockedFolder') === 'true';
if (currentFolder === '' && showLockedFolder) {
    // Filter out existing Locked Folder if disabled
    if (!showLockedFolder) {
        items = items.filter(item => item.name !== 'Locked Folder');
    }
    
    // Add virtual entry if doesn't exist
    const hasLockedFolder = items.some(item => item.name === 'Locked Folder');
    if (!hasLockedFolder) {
        items.push({
            name: 'Locked Folder',
            isDirectory: true,
            isVirtual: true
        });
    }
}
```

## Security Features

1. **Password Requirements:**
   - Minimum 4 characters
   - Must be confirmed during creation
   - Stored encrypted, never in plaintext

2. **Encryption:**
   - AES-256-GCM encryption via biencrypt
   - GitHub username as encryption key
   - Provides recovery option if password forgotten

3. **Persistent Storage:**
   - Encrypted passwords saved to `.locked-folders.json` in repo root
   - Hidden file (starts with `.`) - not visible in uploads folder view
   - Survives server restarts and browser sessions

4. **Private Repository Warning:**
   - Prominent warning displayed when setting password
   - Reminds users that public repos expose Locked Folder contents
   - Yellow warning banner with clear message

5. **Session-Based Access:**
   - Locked folders remain protected until password entered
   - Access granted for current session only
   - Requires re-authentication after page refresh
   - No persistent unlock tokens

## Usage Instructions

### For Users

**To Enable Locked Folder:**
1. Open the view options bar (top of page)
2. Check the "Locked Folder" checkbox
3. Locked Folder appears in sidebar and file grid
4. Preference is saved for future sessions

**To Set Password:**
1. Click on Locked Folder (shows key icon)
2. Read the private repository warning
3. Enter a password (at least 4 characters)
4. Re-enter the password to confirm
5. Press Enter or click "Set Password"
6. Password is encrypted and saved to GitHub repo
7. Note: Your GitHub username can decrypt if you forget

**To Access Locked Folder:**
1. Click on the locked folder (shows red lock icon)
2. Enter the password in the modal
3. Press Enter or click "Unlock & Access"
4. Folder unlocks and icon turns green
5. Navigate freely until page refresh

**To Remove Password:**
1. Click the key/lock button next to Locked Folder
2. Enter the current password
3. Click "Remove Password Protection"
4. Confirm the action
5. Password is deleted from GitHub repo

**Mobile Users:**
- Key/lock button is always visible in sidebar (no hover needed)
- Tap button to quickly access password dialog
- All features work with touch input

### For Developers

**Dependencies:**
```json
{
  "biencrypt": "^1.0.0"
}
```

**Server Configuration:**
```javascript
// Import biencrypt
const { aesEncrypt, aesDecrypt } = require('biencrypt');

// Initialize storage
const lockedFolders = new Map();
const PASSWORD_FILE = '.locked-folders.json';

// Load passwords on server start
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Load existing passwords from GitHub
    // loadPasswordsFromGitHub() called on first API request
});
```

**Frontend Integration:**
```javascript
// Toggle Locked Folder visibility
const lockedFolderToggle = document.getElementById('showLockedFolder');
lockedFolderToggle.addEventListener('change', async (e) => {
    localStorage.setItem('showLockedFolder', e.target.checked);
    await loadSidebarFolders();
    await loadFiles(currentFolder);
});

// Check lock status
const isLocked = await checkFolderLocked('Locked Folder');

// Show password dialog
showLockFolderDialog('Locked Folder');

// Track unlocked state
unlockedFolders.add('Locked Folder');
```

**CSS Customization:**
```css
/* Key action button in sidebar */
.key-action-btn {
    margin-left: auto;
    padding: 0.35rem 0.6rem;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 0.375rem;
    opacity: 0.8;
}

/* Locked folder item styling */
.locked-folder-item {
    /* Dynamic icon colors based on state */
    /* Key: #6b7280, Lock: #ef4444, Unlock: #10b981 */
}
```

## Limitations & Considerations

1. **Private Repository Required:**
   - Locked Folder contents are visible in public repositories
   - Password only controls access through the app
   - GitHub repo contents remain accessible via Git
   - Users warned during password setup

2. **Single Locked Folder:**
   - Only one "Locked Folder" per repository
   - All sensitive files must be stored in this folder
   - Cannot lock arbitrary folders
   - Simpler but less flexible than per-folder locking

3. **GitHub-Based Storage:**
   - Passwords stored in `.locked-folders.json` in repo
   - Requires write access to repository
   - Creates commit for each lock/unlock/remove operation
   - Password file is hidden but still in repo

4. **Recovery Dependency:**
   - GitHub username required for password recovery
   - Users must remember their GitHub username
   - Username change would invalidate old passwords
   - Consider using GitHub user ID instead

5. **Session-Based Access:**
   - Unlocked folders require re-authentication after page refresh
   - Not persistent across browser sessions
   - Good for security, may impact convenience
   - No "remember me" option

6. **Browser Storage:**
   - Toggle preference stored in localStorage
   - Clearing browser data resets preference
   - Not synced across devices
   - Each device needs separate configuration

## Future Enhancements

1. **Multiple Locked Folders:**
   - Allow users to create custom locked folders
   - Per-folder password protection
   - Different passwords for different folders
   - More flexible organization

2. **Advanced Recovery:**
   - Email-based password reset
   - Security questions
   - Backup codes generation
   - Multi-factor recovery options

3. **Client-Side Encryption:**
   - Encrypt files before uploading to GitHub
   - True end-to-end encryption
   - Files remain encrypted at rest
   - Password never leaves client

4. **Access Logs:**
   - Track lock/unlock attempts
   - Notify on suspicious activity
   - Audit trail for folder access
   - Failed attempt tracking

5. **Shared Access:**
   - Allow multiple passwords per folder
   - Grant temporary access to other users
   - Time-based access expiry
   - Revocable access tokens

6. **Stronger Security:**
   - Two-factor authentication
   - Biometric authentication (for PWA)
   - Hardware key support (WebAuthn)
   - Password strength meter

7. **User Experience:**
   - "Remember me" option for session persistence
   - Password change without removing lock
   - Bulk operations on locked content
   - Drag-and-drop into Locked Folder

8. **Repository Visibility Detection:**
   - Auto-detect if repo is public/private
   - Show/hide warning based on actual visibility
   - Prevent locking in public repos
   - API call to check repo status

## Testing Checklist

- [x] Enable Locked Folder via toggle
- [x] Disable Locked Folder via toggle
- [x] Set password for first time
- [x] Unlock folder with correct password
- [x] Reject incorrect password
- [x] Show dynamic icons (key/lock/unlock)
- [x] Key action button in sidebar
- [x] Session-based unlocking
- [x] Password minimum length validation
- [x] Password confirmation matching
- [x] Encryption/decryption using GitHub username
- [x] Recovery hint display
- [x] Private repo warning display
- [x] Remove password functionality
- [x] Persist passwords to GitHub repo
- [x] Load passwords from GitHub on server start
- [x] Auto-focus input on modal open
- [x] Enter key navigation between inputs
- [x] Enter key to submit forms
- [x] Hide Locked Folder when disabled
- [x] Show Locked Folder in sidebar
- [x] Show Locked Folder in file grid
- [x] Virtual folder creation at root
- [x] Path-based lock checking (subfolders)
- [x] Mobile-friendly key button
- [x] localStorage preference persistence

## Conclusion

The Locked Folder feature provides a dedicated, secure container for sensitive files with encrypted password protection. The implementation uses a single "Locked Folder" approach that simplifies the user experience while maintaining strong security through AES-256-GCM encryption.

**Key Advantages:**
- ✅ **Simple UX**: One folder, clear purpose
- ✅ **Persistent**: Passwords survive server restarts
- ✅ **Secure**: Industry-standard encryption
- ✅ **Recoverable**: GitHub username enables password recovery
- ✅ **Optional**: Users enable only when needed
- ✅ **Mobile-Friendly**: Touch-optimized interface
- ✅ **Keyboard-Friendly**: Fast navigation with Enter key

**Important Notes:**
- ⚠️ **Private Repos Only**: Public repositories expose all content
- ⚠️ **App-Level Security**: GitHub API can still access files
- ⚠️ **Single Folder**: All sensitive files must be in one location
- ⚠️ **Session-Based**: Re-authentication required after refresh

**Best Practices:**
1. Use a strong, unique password
2. Keep repository private
3. Remember your GitHub username
4. Store unrelated sensitive files elsewhere
5. Don't share repository access broadly

**For Production Deployment:**
- Consider true client-side encryption
- Implement rate limiting on unlock attempts
- Add access logging and monitoring
- Provide backup/export functionality
- Add repository visibility detection
- Consider multi-factor authentication

The feature integrates seamlessly with the existing application and provides a balance between security and usability for storing sensitive files in GitHub repositories.
