// PDF Viewer Module - Continuous Scroll Mode
class PDFViewer {
    constructor() {
        // Set up PDF.js worker
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        this.pdfDoc = null;
        this.pageCount = 0;
        this.scale = 1.0;
        this.renderedPages = new Set();
        this.renderTasks = new Map(); // Track ongoing render tasks
        this.isRendering = false;
    }

    /**
     * Display PDF from blob - continuous scroll mode
     */
    async display(blob, container) {
        try {
            // Clear container
            container.innerHTML = '';

            // Create viewer UI
            this.createViewerUI(container);

            // Load PDF
            const arrayBuffer = await blob.arrayBuffer();
            this.pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
            this.pageCount = this.pdfDoc.numPages;

            // Render all pages continuously
            await this.renderAllPages();
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showError(container, error.message);
        }
    }

    /**
     * Create viewer UI with floating bottom zoom controls
     */
    createViewerUI(container) {
        const html = `
            <div class="pdf-viewer-container">
                <div class="pdf-pages-container" id="pdfPagesContainer">
                    <!-- All pages will be rendered here -->
                </div>
                <div class="pdf-zoom-controls-bottom" id="pdfZoomControls">
                    <button class="pdf-btn" id="pdfZoomOutBtn" title="Zoom Out"><i class="fas fa-search-minus"></i></button>
                    <span class="pdf-zoom-display" id="pdfZoomLevel">${Math.round(this.scale * 100)}%</span>
                    <button class="pdf-btn" id="pdfZoomInBtn" title="Zoom In"><i class="fas fa-search-plus"></i></button>
                    <button class="pdf-btn" id="pdfZoomResetBtn" title="Reset Zoom"><i class="fas fa-compress-arrows-alt"></i></button>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Attach event listeners
        this.attachEventListeners(container);
    }

    /**
     * Attach event listeners to controls
     */
    attachEventListeners(container) {
        const zoomOutBtn = container.querySelector('#pdfZoomOutBtn');
        const zoomInBtn = container.querySelector('#pdfZoomInBtn');
        const zoomResetBtn = container.querySelector('#pdfZoomResetBtn');

        zoomOutBtn.addEventListener('click', () => this.zoomAll(-0.1)); // Decrease zoom by 10%
        zoomInBtn.addEventListener('click', () => this.zoomAll(0.1)); // Increase zoom by 10%
        zoomResetBtn.addEventListener('click', () => this.resetZoom());
    }

    /**
     * Render all pages continuously
     */
    async renderAllPages() {
        const container = document.querySelector('#pdfPagesContainer');
        
        // Create canvas elements for each page
        for (let pageNum = 1; pageNum <= this.pageCount; pageNum++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'pdf-page-wrapper';
            pageDiv.dataset.page = pageNum;
            
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-canvas-continuous';
            canvas.dataset.page = pageNum;
            
            pageDiv.appendChild(canvas);
            container.appendChild(pageDiv);
        }

        // Render pages with intersection observer for efficiency
        this.setupIntersectionObserver();
    }

    /**
     * Set up intersection observer to render visible pages
     */
    setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.page);
                    if (!this.renderedPages.has(pageNum)) {
                        this.renderPage(pageNum);
                    }
                }
            });
        }, {
            rootMargin: '100px' // Start rendering 100px before visible
        });

        document.querySelectorAll('.pdf-canvas-continuous').forEach(canvas => {
            observer.observe(canvas);
        });
    }

    /**
     * Render single page
     */
    async renderPage(pageNum) {
        if (!this.pdfDoc) return;

        // Cancel any existing render task for this page
        if (this.renderTasks.has(pageNum)) {
            const existingTask = this.renderTasks.get(pageNum);
            existingTask.cancel();
            this.renderTasks.delete(pageNum);
        }

        this.renderedPages.add(pageNum);

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const canvas = document.querySelector(`canvas[data-page="${pageNum}"]`);

            if (!canvas) {
                console.error('Canvas not found for page', pageNum);
                return;
            }

            // Use device pixel ratio for crisp rendering on mobile/retina
            const viewport = page.getViewport({ scale: this.scale });
            const dpr = window.devicePixelRatio || 1;

            // Fit the full page at 100%; allow overflow when zoomed in
            if (this.scale <= 1.0) {
                canvas.style.width = '100%';
                canvas.style.maxWidth = '100%';
            } else {
                canvas.style.width = `${viewport.width}px`;
                canvas.style.maxWidth = 'none';
            }
            canvas.style.height = 'auto';

            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);

            const renderTask = page.render({
                canvasContext: canvas.getContext('2d'),
                viewport: viewport,
                transform: [dpr, 0, 0, dpr, 0, 0]
            });

            // Store the render task
            this.renderTasks.set(pageNum, renderTask);

            await renderTask.promise;

            // Remove completed task
            this.renderTasks.delete(pageNum);

        } catch (error) {
            // Clean up on error
            this.renderTasks.delete(pageNum);
            if (error.name !== 'RenderingCancelledException') {
                console.error('Error rendering page', pageNum, ':', error);
            }
        }
    }

    /**
     * Zoom all pages
     */
    async zoomAll(delta) {
        const newScale = this.scale + delta;
        if (newScale >= 0.5 && newScale <= 5) {
            this.scale = newScale;
            this.updateZoomLevel();
            
            // Re-render all visible pages with new scale
            this.renderedPages.clear();
            document.querySelectorAll('.pdf-canvas-continuous').forEach(canvas => {
                canvas.width = 0;
                canvas.height = 0;
            });
            
            this.setupIntersectionObserver();
        }
    }

    /**
     * Reset zoom to default
     */
    async resetZoom() {
        this.scale = 1.0;
        this.updateZoomLevel();
        
        // Re-render all visible pages
        this.renderedPages.clear();
        document.querySelectorAll('.pdf-canvas-continuous').forEach(canvas => {
            canvas.width = 0;
            canvas.height = 0;
        });
        
        this.setupIntersectionObserver();
    }

    /**
     * Update zoom level display
     */
    updateZoomLevel() {
        const zoomDisplay = document.querySelector('#pdfZoomLevel');
        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(this.scale * 100) + '%';
        }
    }

    /**
     * Show error message
     */
    showError(container, message) {
        container.innerHTML = `
            <div class="pdf-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Failed to Load PDF</h3>
                <p>${message}</p>
                <p style="font-size: 0.85rem; margin-top: 1rem;">Try downloading the file to view it offline</p>
            </div>
        `;
    }
}

// Initialize on load
window.PDFViewer = PDFViewer;
