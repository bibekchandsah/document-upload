// Image Editor Module
class ImageEditor {
    constructor() {
        // DOM Elements
        this.modal = document.getElementById('imageEditorModal');
        this.canvas = document.getElementById('editorCanvas');
        this.editorContainer = document.getElementById('editorContainer');
        
        // Buttons
        this.editBtn = document.getElementById('editImageBtn');
        this.rotateLeftBtn = document.getElementById('rotateLeftBtn');
        this.rotateRightBtn = document.getElementById('rotateRightBtn');
        this.flipHorizontalBtn = document.getElementById('flipHorizontalBtn');
        this.flipVerticalBtn = document.getElementById('flipVerticalBtn');
        this.cropBtn = document.getElementById('cropBtn');
        this.resetBtn = document.getElementById('resetEditorBtn');
        this.saveAsNewBtn = document.getElementById('saveAsNewBtn');
        this.saveOverwriteBtn = document.getElementById('saveOverwriteBtn');
        this.closeBtn = document.getElementById('closeEditorBtn');
        
        // State
        this.cropper = null;
        this.originalImageUrl = null;
        this.currentFile = null;
        this.cropMode = false;
        
        // Configuration (will be set from main app)
        this.config = {
            apiBase: '',
            ghToken: '',
            ghUser: '',
            ghRepo: '',
            ghBranch: 'main',
            currentFolder: ''
        };
        
        this.initEventListeners();
    }
    
    configure(config) {
        this.config = { ...this.config, ...config };
    }
    
    // Method to check if filename exists in current folder
    checkFileExists(filename) {
        // Access global currentFiles array from app.js
        if (typeof window.currentFiles !== 'undefined' && Array.isArray(window.currentFiles)) {
            return window.currentFiles.some(file => 
                !file.isDirectory && file.name.toLowerCase() === filename.toLowerCase()
            );
        }
        return false;
    }
    
    initEventListeners() {
        if (this.rotateLeftBtn) {
            this.rotateLeftBtn.addEventListener('click', () => this.rotate(-90));
        }
        
        if (this.rotateRightBtn) {
            this.rotateRightBtn.addEventListener('click', () => this.rotate(90));
        }
        
        if (this.flipHorizontalBtn) {
            this.flipHorizontalBtn.addEventListener('click', () => this.flip('horizontal'));
        }
        
        if (this.flipVerticalBtn) {
            this.flipVerticalBtn.addEventListener('click', () => this.flip('vertical'));
        }
        
        if (this.cropBtn) {
            this.cropBtn.addEventListener('click', () => this.toggleCropMode());
        }
        
        if (this.resetBtn) {
            this.resetBtn.addEventListener('click', () => this.reset());
        }
        
        if (this.saveAsNewBtn) {
            this.saveAsNewBtn.addEventListener('click', () => this.save(true));
        }
        
        if (this.saveOverwriteBtn) {
            this.saveOverwriteBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to overwrite the original image?')) {
                    this.save(false);
                }
            });
        }
        
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }
    }
    
    initCropper(imageUrl) {
        // Destroy existing cropper if any
        if (this.cropper) {
            this.cropper.destroy();
        }
        
        // Create image element if canvas is not an img
        if (this.canvas.tagName !== 'IMG') {
            const img = document.createElement('img');
            img.id = 'editorCanvas';
            img.style.maxWidth = '100%';
            this.canvas.parentNode.replaceChild(img, this.canvas);
            this.canvas = img;
        }
        
        this.canvas.src = imageUrl;
        
        // Initialize Cropper.js
        this.cropper = new Cropper(this.canvas, {
            viewMode: 1,
            dragMode: 'move',
            aspectRatio: NaN,
            autoCropArea: 0,
            autoCrop: false,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false
        });
    }
    
    open(file, preloadedBlob = null) {
        this.currentFile = file;
        
        // Show modal immediately
        this.modal.classList.remove('hidden');
        
        // Hide viewer modal if open
        const viewerModal = document.getElementById('viewerModal');
        if (viewerModal) {
            viewerModal.classList.add('hidden');
        }
        
        // If we have a preloaded blob, use it directly
        if (preloadedBlob) {
            console.log('Using preloaded image blob for editing');
            this.loadImageFromBlob(preloadedBlob);
            return;
        }
        
        // Otherwise, show loading indicator and fetch the image
        if (this.editorContainer) {
            this.editorContainer.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: white;"><i class="fas fa-spinner fa-spin" style="font-size: 3rem; margin-bottom: 1rem;"></i><p>Loading image for editing...</p></div>';
        }
        
        // Construct proper file path
        const folderPath = this.config.currentFolder || '';
        const filePath = folderPath ? `${folderPath}/${file.name}` : file.name;
        
        // Get the image URL with authentication using the view endpoint
        const fileUrl = `${this.config.apiBase}/github/view?owner=${this.config.ghUser}&repo=${this.config.ghRepo}&branch=${this.config.ghBranch}&path=${encodeURIComponent(filePath)}`;
        
        fetch(fileUrl, {
            headers: {
                'Authorization': `Bearer ${this.config.ghToken}`
            }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to load image: ${res.status}`);
            }
            return res.blob();
        })
        .then(blob => this.loadImageFromBlob(blob))
        .catch(err => {
            console.error('Failed to load image for editing:', err);
            if (this.editorContainer) {
                this.editorContainer.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: white;"><i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem; color: #ef4444;"></i><p style="color: #ef4444;">Failed to load image</p><p style="font-size: 0.85rem; color: #999;">' + err.message + '</p></div>';
            }
        });
    }
    
    loadImageFromBlob(blob) {
        // Check if it's HEIC/HEIF format and convert if needed
        const isHEIC = blob.type.includes('heic') || blob.type.includes('heif') || this.currentFile.name.match(/\.(heic|heif)$/i);
        
        const processBlob = (finalBlob) => {
            const url = URL.createObjectURL(finalBlob);
            this.originalImageUrl = url;
            
            // Restore canvas in container
            if (this.editorContainer) {
                this.editorContainer.innerHTML = '<canvas id="editorCanvas" style="max-width: 100%; max-height: 100%; border: 2px solid var(--border-color);"></canvas>';
                // Re-initialize cropper with the saved image
                this.canvas = document.getElementById('editorCanvas');
                this.initCropper(url);
            }
        };
        
        if (isHEIC && typeof heic2any !== 'undefined') {
            // Show conversion message only if not already converted
            console.log('Converting HEIC image for editing...');
            if (this.editorContainer) {
                this.editorContainer.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: white;"><i class="fas fa-spinner fa-spin" style="font-size: 3rem; margin-bottom: 1rem;"></i><p>Converting HEIC image...</p></div>';
            }
            
            heic2any({
                blob: blob,
                toType: 'image/jpeg',
                quality: 0.9
            })
            .then(convertedBlob => {
                console.log('HEIC converted successfully for editing');
                processBlob(convertedBlob);
            })
            .catch(err => {
                console.error('HEIC conversion failed:', err);
                if (this.editorContainer) {
                    this.editorContainer.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: white;"><i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem; color: #ef4444;"></i><p style="color: #ef4444;">Failed to convert HEIC image</p><p style="font-size: 0.85rem; color: #999;">' + err.message + '</p></div>';
                }
            });
        } else {
            processBlob(blob);
        }
    }
    
    rotate(degrees) {
        if (this.cropper) {
            this.cropper.rotate(degrees);
        }
    }
    
    flip(axis) {
        if (this.cropper) {
            if (axis === 'horizontal') {
                const scaleX = this.cropper.getData().scaleX || 1;
                this.cropper.scaleX(-scaleX);
            } else {
                const scaleY = this.cropper.getData().scaleY || 1;
                this.cropper.scaleY(-scaleY);
            }
        }
    }
    
    toggleCropMode() {
        if (!this.cropper) return;
        
        this.cropMode = !this.cropMode;
        
        if (this.cropMode) {
            this.cropper.crop();
            this.cropper.setDragMode('crop');
            if (this.cropBtn) {
                this.cropBtn.style.background = 'var(--primary-color)';
                this.cropBtn.style.color = 'white';
            }
        } else {
            this.cropper.clear();
            this.cropper.setDragMode('move');
            if (this.cropBtn) {
                this.cropBtn.style.background = '';
                this.cropBtn.style.color = '';
            }
        }
    }
    
    reset() {
        if (this.cropper && this.originalImageUrl) {
            this.cropper.reset();
            this.cropMode = false;
            if (this.cropBtn) {
                this.cropBtn.style.background = '';
                this.cropBtn.style.color = '';
            }
        }
    }
    
    async save(saveAsNew) {
        if (!this.cropper) return;
        
        // Show processing indicator
        if (typeof showProcessing === 'function') {
            showProcessing('Saving image...');
        }
        
        try {
            // Get the canvas from Cropper.js
            // If crop mode is active, get cropped canvas, otherwise get full canvas with transformations
            let canvas;
            if (this.cropMode) {
                canvas = this.cropper.getCroppedCanvas();
            } else {
                // Get canvas with all transformations (rotate, flip) applied
                canvas = this.cropper.getCroppedCanvas({
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high'
                });
            }
            
            if (!canvas) {
                throw new Error('Failed to generate image canvas');
            }
            
            // Convert to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            
            if (!blob) {
                throw new Error('Failed to generate image blob');
            }
            
            // Generate filename
            let filename = this.currentFile.name;
            if (saveAsNew) {
                const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
                const ext = filename.substring(filename.lastIndexOf('.'));
                const defaultName = `${nameWithoutExt}_edited${ext}`;
                
                // Ask user for filename
                let userFilename = prompt('Enter filename for the copy:', defaultName);
                
                // If user cancels, abort save
                if (userFilename === null) {
                    if (typeof hideProcessing === 'function') {
                        hideProcessing();
                    }
                    return;
                }
                
                // If user provides a name, use it; otherwise use default
                userFilename = userFilename.trim() || defaultName;
                
                // Ensure file has an extension
                if (!userFilename.includes('.')) {
                    userFilename += ext;
                }
                
                // Check if filename already exists in current folder
                if (this.checkFileExists(userFilename)) {
                    const overwrite = confirm(`A file named "${userFilename}" already exists. Do you want to overwrite it?`);
                    if (!overwrite) {
                        if (typeof hideProcessing === 'function') {
                            hideProcessing();
                        }
                        return;
                    }
                }
                
                filename = userFilename;
            }
            
            // Upload the file
            const file = new File([blob], filename, { type: 'image/png' });
            const formData = new FormData();
            formData.append('files', file);
            formData.append('owner', this.config.ghUser);
            formData.append('repo', this.config.ghRepo);
            formData.append('branch', this.config.ghBranch);
            formData.append('folder', this.config.currentFolder);
            
            const response = await fetch(`${this.config.apiBase}/github/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.ghToken}`
                },
                body: formData
            });
            
            if (response.ok) {
                alert(saveAsNew ? 'Image saved as new copy!' : 'Image saved successfully!');
                this.close();
                
                // Trigger folder reload if function exists
                if (typeof selectFolder === 'function') {
                    await selectFolder(this.config.currentFolder, false);
                }
            } else {
                const error = await response.text();
                throw new Error(error || 'Failed to save image');
            }
        } catch (error) {
            console.error('Error saving image:', error);
            alert('Failed to save image: ' + error.message);
        } finally {
            if (typeof hideProcessing === 'function') {
                hideProcessing();
            }
        }
    }
    
    close() {
        this.modal.classList.add('hidden');
        
        // Destroy cropper instance
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        
        // Revoke object URL
        if (this.originalImageUrl) {
            URL.revokeObjectURL(this.originalImageUrl);
            this.originalImageUrl = null;
        }
        
        // Update URL to remove file parameter
        if (this.config.currentFolder) {
            const newUrl = `${window.location.pathname}?folder=${encodeURIComponent(this.config.currentFolder)}`;
            history.pushState({ folder: this.config.currentFolder }, '', newUrl);
        } else {
            // If no folder, just go to root
            history.pushState({}, '', window.location.pathname);
        }
        
        // Reset state
        this.currentFile = null;
        this.cropMode = false;
    }
}

// Export as global
window.ImageEditor = ImageEditor;
