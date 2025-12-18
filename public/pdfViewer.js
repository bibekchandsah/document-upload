// PDF Viewer Module
class PDFViewer {
    constructor() {
        // Set up PDF.js worker
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageCount = 0;
        this.scale = 1.5;
        this.currentScale = 1.5;
        this.isRendering = false;
    }

    /**
     * Display PDF from blob
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

            // Update page info
            this.updatePageInfo();

            // Render first page
            await this.renderPage(1);
        } catch (error) {
            console.error('Error loading PDF:', error);
            this.showError(container, error.message);
        }
    }

    /**
     * Create viewer UI with controls
     */
    createViewerUI(container) {
        const html = `
            <div class="pdf-viewer-container">
                <div class="pdf-controls">
                    <div class="pdf-control-group">
                        <button class="pdf-btn" id="pdfFirstBtn" title="First Page">
                            <i class="fas fa-step-backward"></i>
                        </button>
                        <button class="pdf-btn" id="pdfPrevBtn" title="Previous Page">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                    </div>

                    <div class="pdf-control-group">
                        <span class="pdf-page-info">Page</span>
                        <input type="number" class="pdf-page-input" id="pdfPageNum" min="1" value="1" title="Enter page number">
                        <span class="pdf-page-info" id="pdfPageCount">of 1</span>
                    </div>

                    <div class="pdf-control-group">
                        <button class="pdf-btn" id="pdfNextBtn" title="Next Page">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                        <button class="pdf-btn" id="pdfLastBtn" title="Last Page">
                            <i class="fas fa-step-forward"></i>
                        </button>
                    </div>

                    <div class="pdf-control-group" style="margin-left: auto;">
                        <button class="pdf-btn" id="pdfZoomOutBtn" title="Zoom Out">
                            <i class="fas fa-search-minus"></i>
                        </button>
                        <span class="pdf-zoom-display" id="pdfZoomLevel">150%</span>
                        <button class="pdf-btn" id="pdfZoomInBtn" title="Zoom In">
                            <i class="fas fa-search-plus"></i>
                        </button>
                        <button class="pdf-btn" id="pdfZoomResetBtn" title="Reset Zoom">
                            <i class="fas fa-compress-arrows-alt"></i>
                        </button>
                    </div>

                    <div class="pdf-control-group">
                        <button class="pdf-btn" id="pdfDownloadBtn" title="Download PDF">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>

                <div class="pdf-canvas-container" id="pdfCanvasContainer">
                    <canvas id="pdfCanvas"></canvas>
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
        const firstBtn = container.querySelector('#pdfFirstBtn');
        const prevBtn = container.querySelector('#pdfPrevBtn');
        const nextBtn = container.querySelector('#pdfNextBtn');
        const lastBtn = container.querySelector('#pdfLastBtn');
        const pageNumInput = container.querySelector('#pdfPageNum');
        const zoomOutBtn = container.querySelector('#pdfZoomOutBtn');
        const zoomInBtn = container.querySelector('#pdfZoomInBtn');
        const zoomResetBtn = container.querySelector('#pdfZoomResetBtn');

        firstBtn.addEventListener('click', () => this.goToPage(1));
        prevBtn.addEventListener('click', () => this.goToPage(this.pageNum - 1));
        nextBtn.addEventListener('click', () => this.goToPage(this.pageNum + 1));
        lastBtn.addEventListener('click', () => this.goToPage(this.pageCount));

        pageNumInput.addEventListener('change', (e) => {
            const pageNum = parseInt(e.target.value);
            if (pageNum >= 1 && pageNum <= this.pageCount) {
                this.goToPage(pageNum);
            } else {
                e.target.value = this.pageNum;
            }
        });

        zoomOutBtn.addEventListener('click', () => this.zoom(-0.25));
        zoomInBtn.addEventListener('click', () => this.zoom(0.25));
        zoomResetBtn.addEventListener('click', () => this.resetZoom());
    }

    /**
     * Go to specific page
     */
    async goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.pageCount || this.isRendering) {
            return;
        }
        this.pageNum = pageNum;
        this.updatePageInfo();
        await this.renderPage(pageNum);
    }

    /**
     * Render current page
     */
    async renderPage(pageNum) {
        if (this.isRendering || !this.pdfDoc) return;

        this.isRendering = true;

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const container = document.querySelector('#pdfCanvasContainer');
            const canvas = document.querySelector('#pdfCanvas');

            if (!canvas) {
                console.error('Canvas not found');
                return;
            }

            // Get container width for responsive scaling
            const containerWidth = container.clientWidth - 40; // 40px padding
            const viewport = page.getViewport({ scale: this.currentScale });

            // Adjust scale if page is too wide
            if (viewport.width > containerWidth) {
                const adjustedScale = (containerWidth / viewport.width) * this.currentScale;
                const adjustedViewport = page.getViewport({ scale: adjustedScale });
                this.currentScale = adjustedScale;

                canvas.width = adjustedViewport.width;
                canvas.height = adjustedViewport.height;

                await page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: adjustedViewport
                }).promise;
            } else {
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: viewport
                }).promise;
            }

            this.isRendering = false;
        } catch (error) {
            console.error('Error rendering page:', error);
            this.isRendering = false;
        }
    }

    /**
     * Zoom in/out
     */
    async zoom(delta) {
        const newScale = this.currentScale + delta;
        if (newScale >= 0.5 && newScale <= 3) {
            this.currentScale = newScale;
            this.updateZoomLevel();
            await this.renderPage(this.pageNum);
        }
    }

    /**
     * Reset zoom to default
     */
    async resetZoom() {
        this.currentScale = this.scale;
        this.updateZoomLevel();
        await this.renderPage(this.pageNum);
    }

    /**
     * Update page info display
     */
    updatePageInfo() {
        const pageNumInput = document.querySelector('#pdfPageNum');
        const pageCountSpan = document.querySelector('#pdfPageCount');

        if (pageNumInput) pageNumInput.value = this.pageNum;
        if (pageCountSpan) pageCountSpan.textContent = `of ${this.pageCount}`;
    }

    /**
     * Update zoom level display
     */
    updateZoomLevel() {
        const zoomDisplay = document.querySelector('#pdfZoomLevel');
        if (zoomDisplay) {
            zoomDisplay.textContent = Math.round(this.currentScale * 100) + '%';
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
