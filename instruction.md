
**Title:** Build a Responsive Document Uploader & Document Viewer Web App (Frontend + Backend)

**Description:**
Build a full-stack web application that allows users to upload documents into folders, browse folders, view documents online, and download or print them. The system must be responsive, modern-looking, secure, and scalable.

---

## 🧩 **Requirements**

### **1. Technology Stack**

* **Frontend:** HTML, CSS, JavaScript (Vanilla or React—choose best fit)
* **Backend:** Node.js + Express.js
* **Storage:** Local file system (with folders)
* **Optional:** GitHub API integration to store documents in a GitHub repository

---

## 🗂️ **2. Core Features**

### **A. Document Upload**

* User can:

  * Select a folder (dropdown or create new folder)
  * Upload one or multiple documents
* Validate file types:

  * `.pdf`, `.docx`, `.xlsx`, `.jpg`, `.png`, `.txt`
* Store uploads inside `uploads/<folder_name>/` on the server

### **B. Folder Browser**

* Left sidebar shows list of all folders
* Clicking a folder loads all files inside it
* Show file size, upload date, and type

### **C. Document Viewer**

* On clicking a file:

  * If **PDF**, open in an embedded PDF viewer
  * If **image**, show preview
  * If **DOCX/XLSX**, convert to previewable format OR show “Download to View”
* Viewer should show:

  * **Download button**
  * **Print button**
  * **Open in new tab**

### **D. Responsive Modern UI**

* Clean and modern interface
* Works on mobile, tablet, desktop
* Include:

  * Sidebar collapsible menu
  * Card/grid layout for files
  * Tailwind or custom CSS
  * Dark mode (optional)

---

## 🔐 **3. Security Requirements**

* Sanitize file names
* Limit file size (configurable)
* Validate MIME types on server
* Block uploading of executable files
* Prevent directory traversal

---

## ⚙️ **4. Backend API Endpoints**

### **Folder Operations**

* `GET /api/folders` → list folders
* `POST /api/folders` → create new folder

### **File Operations**

* `POST /api/upload` → upload file(s)
* `GET /api/folders/:folder/files` → list files
* `GET /api/files/view/:folder/:file` → stream file for preview
* `GET /api/files/download/:folder/:file` → download file
* `GET /api/files/print/:folder/:file` → return printable format

---

## 📱 **5. Frontend Pages**

1. **Home Dashboard**

   * Folder list (sidebar)
   * Upload button
   * File grid

2. **Document Viewer Page**

   * Embedded viewer
   * Print button
   * Download button
   * “Back to Folder” button

---

## 🎨 **6. Design Guidelines**

* Use modern UI cards for files:

  * Document icon + name
  * Hover effects
  * 3-dot menu (Download / Print / Delete)
* Folder sidebar with icons
* Responsive grid for documents
* Scrollable viewer layout
* Use Tailwind or Material UI look-alike styling

---

## 📄 **7. Additional Optional Features**

* PDF merging
* Search bar
* Filter by file type
* User authentication
* Store files in GitHub repository automatically

---

## 🚀 **8. Deliverables**

* Fully working **Node.js + Express backend**
* Fully responsive **HTML/CSS/JS or React frontend**
* API documentation
* Folder-based storage structure
* Proper error handling and validations
* Clean, readable code with comments

---

## 📌 **Instruction**

**You must generate the entire application (frontend + backend) including directory structure, HTML/JS/CSS files, Node.js APIs, file handling, responsive UI, and document viewer integration.
Code must be production-ready, clean, and fully functional.**



https://docs.google.com/gview?url=http://localhost:3000/ynnus/COM22000995.pdf&embedded=true