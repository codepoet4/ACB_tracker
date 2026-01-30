// Chess Analyzer JavaScript Application

// DOM Elements
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const fenInput = document.getElementById('fenInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const resultsContent = document.getElementById('resultsContent');
const errorContent = document.getElementById('errorContent');
const noResultsContent = document.getElementById('noResultsContent');

let currentImageFile = null;

// Initialize Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    setupTabSwitching();
    setupDragAndDrop();
    setupPaste();
    setupImageInput();
    setupAnalyzeButton();
});

// Tab Switching
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            document.getElementById(tabName + '-tab').classList.add('active');
        });
    });
}

// Drag and Drop
function setupDragAndDrop() {
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleImageFile(files[0]);
        }
    });

    // Handle click on choose image button (not uploadArea to avoid double-triggering)
    const chooseImageBtn = document.getElementById('chooseImageBtn');
    if (chooseImageBtn) {
        chooseImageBtn.addEventListener('click', () => {
            imageInput.click();
        });
    }
}

// Paste Support
function setupPaste() {
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleImageFile(file);
                break;
            }
        }
    });
}

// Image Input Handler
function setupImageInput() {
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageFile(e.target.files[0]);
        }
    });
}

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
    }

    currentImageFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// Load Starting Position
function loadStartingPosition() {
    fetch('/api/starting-position')
        .then(response => response.json())
        .then(data => {
            fenInput.value = data.fen;
        })
        .catch(error => {
            console.error('Error loading starting position:', error);
            showError('Failed to load starting position');
        });
}

// Setup Analyze Button
function setupAnalyzeButton() {
    analyzeBtn.addEventListener('click', analyzeBoard);
}

// Main Analyze Function
async function analyzeBoard() {
    const activeTab = document.querySelector('.tab-content.active');
    const usesFen = activeTab.id === 'fen-tab';

    const side = document.querySelector('input[name="side"]:checked').value;
    const perspective = document.querySelector('input[name="perspective"]:checked').value;

    if (usesFen) {
        const fen = fenInput.value.trim();
        if (!fen) {
            showError('Please enter a FEN notation or select an image');
            return;
        }
        performAnalysis(null, fen, side, perspective);
    } else { // Image tab is active
        // If a file has been manually uploaded, use it.
        if (currentImageFile) {
            performAnalysis(currentImageFile, null, side, perspective);
        // If no file is uploaded, but a FEN exists from a previous analysis, use that.
        } else if (fenInput.value.trim()) {
            performAnalysis(null, fenInput.value.trim(), side, perspective);
        // Otherwise, there is no image and no FEN.
        } else {
            showError('Please upload a chess board image');
            return;
        }
    }
}

// Perform Analysis
async function performAnalysis(imageFile, fen, side, perspective) {
    // Show loading state
    showLoading();
    analyzeBtn.disabled = true;

    try {
        const formData = new FormData();

        if (imageFile) {
            formData.append('image', imageFile);
        } else if (fen) {
            formData.append('fen', fen);
        }

        formData.append('side', side);
        formData.append('perspective', perspective);

        const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log('API Response:', data);

        // If analyzing from image, display the detected FEN (even if there's an error)
        console.log('Checking for image:', !!imageFile, 'detected_fen:', data.detected_fen);
        if (imageFile && data.detected_fen) {
            console.log('Displaying detected FEN:', data.detected_fen);
            displayDetectedFen(data.detected_fen, data.perspective);
            fenInput.value = data.detected_fen; // Store detected FEN for re-analysis
        }

        if (!response.ok) {
            if (data.debug_data) {
                renderDebugTable(data.debug_data);
            }
            throw new Error(data.error || 'Analysis failed');
        }

        displayResults(data);
    } catch (error) {
        showError(error.message || 'An error occurred during analysis');
        console.error('Analysis error:', error);
    } finally {
        hideLoading();
        analyzeBtn.disabled = false;
    }
}

// Display Results
function displayResults(data) {
    noResultsContent.style.display = 'none';
    errorContent.style.display = 'none';
    resultsContent.style.display = 'block';

    // Best Move
    document.getElementById('resultMove').textContent = data.best_move;
    document.getElementById('resultMoveSan').textContent = data.best_move_san;

    // Legal Moves
    const movesContainer = document.getElementById('movesContainer');
    if (data.legal_moves && data.legal_moves.length > 0) {
        const movesList = document.getElementById('resultMoves');
        movesList.innerHTML = data.legal_moves
            .map(move => `<div class="move-tag">${escapeHtml(move)}</div>`)
            .join('');
        movesContainer.style.display = 'block';
    } else {
        movesContainer.style.display = 'none';
    }

    if (data.debug_data) {
        renderDebugTable(data.debug_data);
    }
}

// Show Error
function showError(message) {
    noResultsContent.style.display = 'none';
    resultsContent.style.display = 'none';
    errorContent.style.display = 'block';
    document.getElementById('errorText').textContent = message;
}

// Display Detected FEN
function displayDetectedFen(fen, perspective) {
    console.log('displayDetectedFen called with:', fen, perspective);
    const container = document.getElementById('detectedFenContainer');
    const fenElement = document.getElementById('detectedFen');

    if (!container || !fenElement) {
        console.error('Container or fenElement not found');
        return;
    }

    console.log('Setting FEN text:', fen);
    fenElement.textContent = fen;

    // Remove existing perspective info if any
    const existingPerspective = container.querySelector('.perspective-info');
    if (existingPerspective) {
        existingPerspective.remove();
    }

    // Add perspective info if available
    if (perspective) {
        const perspectiveSpan = document.createElement('small');
        perspectiveSpan.className = 'perspective-info';
        perspectiveSpan.style.color = 'var(--text-light)';
        perspectiveSpan.style.display = 'block';
        perspectiveSpan.style.marginTop = '4px';
        perspectiveSpan.textContent = `(${perspective} perspective)`;
        fenElement.parentElement.appendChild(perspectiveSpan);
    }

    container.style.display = 'block';

    // Setup copy button
    const copyBtn = document.getElementById('copyFenBtn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(fen).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy FEN';
                }, 2000);
            });
        };
    }
}

// Loading State
function showLoading() {
    loadingIndicator.style.display = 'block';
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    noResultsContent.style.display = 'none';
    errorContent.style.display = 'none';
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    resultsContent.parentElement.insertBefore(successDiv, resultsContent);
    setTimeout(() => successDiv.remove(), 3000);
}

function renderDebugTable(debugData) {
    let container = document.getElementById('debugContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'debugContainer';
        container.style.marginTop = '20px';
        
        // Add Toggle Button
        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = 'Show Debug Info';
        toggleBtn.style.width = '100%';
        toggleBtn.style.padding = '8px';
        toggleBtn.style.marginBottom = '10px';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.onclick = function() {
            const content = document.getElementById('debugContent');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                this.textContent = 'Hide Debug Info';
            } else {
                content.style.display = 'none';
                this.textContent = 'Show Debug Info';
            }
        };
        container.appendChild(toggleBtn);
        
        const contentDiv = document.createElement('div');
        contentDiv.id = 'debugContent';
        contentDiv.style.display = 'none';
        container.appendChild(contentDiv);
        
        resultsContent.parentElement.appendChild(container);
    }
    
    const contentDiv = document.getElementById('debugContent');
    
    let html = `
        <h3>Detection Debug Info</h3>
        <div style="max-height: 400px; overflow-y: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: #333; color: white;">
                    <th style="padding: 5px;">Square</th>
                    <th style="padding: 5px;">Original</th>
                    <th style="padding: 5px;">Binary</th>
                    <th style="padding: 5px;">Template</th>
                    <th style="padding: 5px;">Score</th>
                    <th style="padding: 5px;">Color</th>
                    <th style="padding: 5px;">Result</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    debugData.forEach(item => {
        let comparisonsHtml = '';
        if (item.comparisons && item.comparisons.length > 0) {
            comparisonsHtml = '<div style="font-size: 10px; max-height: 100px; overflow-y: auto;">';
            item.comparisons.forEach(comp => {
                comparisonsHtml += `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
                    <span>${comp.char}: ${comp.score.toFixed(3)}</span>
                    <img src="data:image/png;base64,${comp.template_base64}" style="height: 20px; width: 20px; background-color: #333; border: 1px solid #555;">
                </div>`;
            });
            comparisonsHtml += '</div>';
        }

        html += `
            <tr style="border-bottom: 1px solid #ccc;">
                <td style="padding: 5px; text-align: center;">${item.square}</td>
                <td style="padding: 5px; text-align: center;"><img src="data:image/png;base64,${item.board_img}" style="height: 40px;"></td>
                <td style="padding: 5px; text-align: center;">${item.binary_img ? `<img src="data:image/png;base64,${item.binary_img}" style="height: 40px; border: 1px solid #ccc;">` : '-'}</td>
                <td style="padding: 5px; text-align: center;">${item.template_img ? `<img src="data:image/png;base64,${item.template_img}" style="height: 40px;">` : '-'}<br>${comparisonsHtml}</td>
                <td style="padding: 5px; text-align: center;">${item.score.toFixed(3)}</td>
                <td style="padding: 5px; text-align: center; font-size: 11px;">${item.detected_color || '-'}</td>
                <td style="padding: 5px; text-align: center;"><strong>${item.piece}</strong><br><span style="font-size:10px; color:#666;">${item.color_info || ''}</span></td>
            </tr>`;
    });
    
    html += '</tbody></table></div>';
    contentDiv.innerHTML = html;
}
