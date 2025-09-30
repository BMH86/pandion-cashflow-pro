// ============================================================================
// CASHFLOW PRO - MAIN APPLICATION - FIXED & ENHANCED
// Pandion Development Management Services
// Version: 1.1.0 - QC Fixes Applied
// ============================================================================

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showLoading(message = 'Loading...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p class="loading-message">${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    overlay.querySelector('.loading-message').textContent = message;
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <span class="notification-icon">${getNotificationIcon(type)}</span>
        <span class="notification-message">${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

function getNotificationIcon(type) {
    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ'
    };
    return icons[type] || icons.info;
}

// NEW: Button loading state utility
function setButtonLoading(button, isLoading) {
    if (!button) return;
    
    if (isLoading) {
        button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="loading-spinner"></span> Loading...';
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || button.innerHTML;
    }
}

// ENHANCED: Budget category validation
function validateBudgetCategory(data) {
    const errors = [];
    
    if (!data.code || data.code.trim() === '') {
        errors.push('Category code is required');
    }
    
    if (!data.name || data.name.trim() === '') {
        errors.push('Category name is required');
    }
    
    if (data.amount === undefined || data.amount === null || data.amount < 0) {
        errors.push('Amount must be a positive number');
    }
    
    if (!['Hard', 'Soft', 'TI'].includes(data.costType)) {
        errors.push('Invalid cost type');
    }
    
    if (!['s-curve', 'straight-line', 'manual'].includes(data.distributionMethod)) {
        errors.push('Invalid distribution method');
    }
    
    return errors;
}

// NEW: Project info validation
function validateProjectInfo(data) {
    const errors = [];
    
    if (!data.name || data.name.trim() === '') {
        errors.push('Project name is required');
    }
    
    if (data.startDate && data.endDate) {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        if (end < start) {
            errors.push('End date must be after start date');
        }
    }
    
    return errors;
}

// ============================================================================
// MAIN APPLICATION CLASS
// ============================================================================

class CashflowApp {
    constructor() {
        console.log('CashflowApp: Initializing...');
        
        this.currentProjectId = null;
        this.projects = {};
        this.projectData = this.getDefaultProjectData();
        this.unsubscribeCallbacks = [];
        this.chartInstances = new Map();
        
        this.calculations = new CalculationEngine();
        this.visualization = new VisualizationEngine(this);
        
        this.waitForAuth();
    }

    async waitForAuth() {
        console.log('Waiting for auth state...');
        
        if (!window.authManager) {
            console.error('AuthManager not found');
            window.location.href = 'login.html';
            return;
        }
        
        return new Promise((resolve) => {
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                unsubscribe();
                
                if (user) {
                    console.log('User authenticated, initializing app');
                    this.init();
                    resolve();
                } else {
                    console.log('No user authenticated, redirecting to login');
                    window.location.href = 'login.html';
                }
            });
        });
    }

    getDefaultProjectData() {
        return {
            info: {
                name: 'New Construction Project',
                client: '',
                location: '',
                startDate: new Date(),
                endDate: new Date(),
                manager: window.authManager?.currentUser?.email || '',
                logo: null,
                colors: {
                    primary: '#1B365D',
                    secondary: '#407EC9',
                    accent: '#EAAA00',
                    steel: '#505759'
                }
            },
            budgetCategories: [],
            scenarios: {
                baseline: {
                    name: 'Baseline',
                    projections: {},
                    actuals: {},
                    isLocked: false,
                    adjustments: {}
                }
            },
            currentScenario: 'baseline'
        };
    }

    async init() {
        console.log('CashflowApp: Starting initialization...');
        try {
            showLoading('Initializing application...');
            
            await this.loadProjects();
            this.setupEventListeners();
            this.setupTooltips();
            
            hideLoading();
            console.log('CashflowApp: Initialization complete');
        } catch (error) {
            console.error('Initialization error:', error);
            hideLoading();
            showNotification('Failed to initialize application: ' + error.message, 'error');
        }
    }

    // ENHANCED: Better first-time user experience
    async loadProjects() {
        console.log('Loading projects from Firebase...');
        showLoading('Loading projects...');
        
        try {
            const result = await window.firebaseStorage.loadAllProjects();
            
            if (result.success) {
                this.projects = result.data;
                console.log(`Loaded ${Object.keys(this.projects).length} projects`);
                
                const lastProjectId = localStorage.getItem('last_project_id');
                if (lastProjectId && this.projects[lastProjectId]) {
                    await this.loadProject(lastProjectId);
                } else if (Object.keys(this.projects).length > 0) {
                    await this.loadProject(Object.keys(this.projects)[0]);
                } else {
                    // No projects exist - offer to create one
                    hideLoading();
                    const createProject = confirm(
                        'Welcome to Cashflow Pro! You don\'t have any projects yet. ' +
                        'Would you like to create your first project now?'
                    );
                    
                    if (createProject) {
                        this.showProjectCreationDialog();
                    } else {
                        // Show empty state
                        this.showEmptyState();
                    }
                    return; // Exit early to prevent further loading
                }
                
                this.updateProjectSelector();
                this.subscribeToProjectUpdates();
            } else {
                throw new Error(result.error);
            }
            
            hideLoading();
        } catch (error) {
            console.error('Error loading projects:', error);
            hideLoading();
            showNotification('Failed to load projects: ' + error.message, 'error');
        }
    }

    // NEW: Empty state display
    showEmptyState() {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div style="text-align: center; padding: 4rem 2rem;">
                    <div style="font-size: 64px; margin-bottom: 1rem;">📊</div>
                    <h2 style="font-size: 24px; margin-bottom: 1rem; color: var(--pdn-sky);">
                        No Projects Yet
                    </h2>
                    <p style="color: var(--medium-gray); margin-bottom: 2rem;">
                        Get started by creating your first construction project.
                    </p>
                    <button onclick="app.showProjectCreationDialog()" class="btn-primary">
                        + Create Your First Project
                    </button>
                </div>
            `;
        }
    }

    async createNewProject(projectName) {
        console.log(`Creating new project: ${projectName}`);
        const button = document.querySelector('[onclick*="createNewProject"]');
        setButtonLoading(button, true);
        
        try {
            if (!projectName || projectName.trim() === '') {
                throw new Error('Project name is required');
            }
            
            const projectId = 'proj_' + Date.now();
            const newProject = {
                id: projectId,
                name: projectName,
                createdDate: new Date().toISOString(),
                createdBy: window.authManager.currentUser.uid,
                data: this.getDefaultProjectData()
            };
            
            newProject.data.info.name = projectName;
            
            const result = await window.firebaseStorage.saveProject(projectId, newProject);
            
            if (result.success) {
                this.projects[projectId] = newProject;
                this.currentProjectId = projectId;
                this.projectData = newProject.data;
                
                this.updateProjectSelector();
                await this.loadCurrentProject();
                
                showNotification('Project created successfully', 'success');
                return projectId;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error creating project:', error);
            showNotification('Failed to create project: ' + error.message, 'error');
            return null;
        } finally {
            setButtonLoading(button, false);
        }
    }

    async loadProject(projectId) {
        console.log(`Loading project: ${projectId}`);
        showLoading('Loading project...');
        
        try {
            if (this.projects[projectId]) {
                this.currentProjectId = projectId;
                this.projectData = this.projects[projectId].data;
                
                localStorage.setItem('last_project_id', projectId);
                
                await this.loadCurrentProject();
                this.updateProjectSelector();
                
                hideLoading();
                console.log(`Project loaded: ${projectId}`);
            } else {
                throw new Error('Project not found');
            }
        } catch (error) {
            console.error('Error loading project:', error);
            hideLoading();
            showNotification('Failed to load project: ' + error.message, 'error');
        }
    }

    async deleteProject(projectId) {
        if (!window.authManager.isSuperAdmin()) {
            showNotification('Only super admin can delete projects', 'error');
            return;
        }
        
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }
        
        console.log(`Deleting project: ${projectId}`);
        showLoading('Deleting project...');
        
        try {
            const result = await window.firebaseStorage.deleteProject(projectId);
            
            if (result.success) {
                delete this.projects[projectId];
                
                if (this.currentProjectId === projectId) {
                    this.currentProjectId = null;
                    this.projectData = this.getDefaultProjectData();
                }
                
                this.updateProjectSelector();
                
                if (Object.keys(this.projects).length > 0) {
                    await this.loadProject(Object.keys(this.projects)[0]);
                } else {
                    this.showProjectCreationDialog();
                }
                
                hideLoading();
                showNotification('Project deleted successfully', 'success');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Error deleting project:', error);
            hideLoading();
            showNotification('Failed to delete project: ' + error.message, 'error');
        }
    }

    async saveCurrentProject() {
        if (!this.currentProjectId) {
            console.warn('No current project to save');
            return;
        }
        
        try {
            const project = this.projects[this.currentProjectId];
            project.data = this.projectData;
            
            const result = await window.firebaseStorage.saveProject(this.currentProjectId, project);
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            console.log('Project saved successfully');
        } catch (error) {
            console.error('Error saving project:', error);
            showNotification('Failed to save project: ' + error.message, 'error');
        }
    }

    debouncedSave = debounce(() => this.saveCurrentProject(), 1000);

    subscribeToProjectUpdates() {
        this.unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
        this.unsubscribeCallbacks = [];
        
        const unsubscribe = window.firebaseStorage.subscribeToAllProjects((result) => {
            if (result.success) {
                this.projects = result.data;
                this.updateProjectSelector();
                
                if (this.currentProjectId && this.projects[this.currentProjectId]) {
                    const updatedProject = this.projects[this.currentProjectId];
                    if (JSON.stringify(updatedProject.data) !== JSON.stringify(this.projectData)) {
                        console.log('Project updated by another user, reloading...');
                        this.projectData = updatedProject.data;
                        this.loadCurrentProject();
                        showNotification('Project updated by another user', 'info', 2000);
                    }
                }
            }
        });
        
        this.unsubscribeCallbacks.push(unsubscribe);
    }

    async loadCurrentProject() {
        console.log('Loading current project data...');
        try {
            if (this.projectData?.scenarios) {
                Object.values(this.projectData.scenarios).forEach(scenario => {
                    if (scenario && typeof scenario === 'object' && !scenario.adjustments) {
                        scenario.adjustments = {};
                    }
                });
            }

            this.renderBudgetTable();
            this.updateProjectSummary();
            this.updateProjectInfo();
            this.loadScenarios();

            console.log('Current project loaded');
        } catch (error) {
            console.error('Error loading current project:', error);
            showNotification('Error loading project data: ' + error.message, 'error');
        }
    }

    updateProjectSelector() {
        console.log('Updating project selector');
        const selector = document.getElementById('project-selector');
        if (!selector) return;

        selector.innerHTML = '';
        
        Object.keys(this.projects).forEach(projectId => {
            const project = this.projects[projectId];
            const option = document.createElement('option');
            option.value = projectId;
            option.textContent = project.name;
            option.selected = projectId === this.currentProjectId;
            selector.appendChild(option);
        });
        
        if (Object.keys(this.projects).length === 0) {
            const option = document.createElement('option');
            option.textContent = 'No projects available';
            option.disabled = true;
            selector.appendChild(option);
        }
    }

    addBudgetCategory(code, name, amount, costType, distributionMethod = 's-curve', distributionParams = {}) {
        console.log(`Adding budget category: ${code} - ${name}`);
        
        try {
            const validation = validateBudgetCategory({
                code, name, amount, costType, distributionMethod
            });
            
            if (validation.length > 0) {
                throw new Error(validation.join(', '));
            }
            
            const category = {
                id: Date.now(),
                code: code.trim(),
                name: name.trim(),
                amount: parseFloat(amount) || 0,
                costType: costType,
                distributionMethod: distributionMethod,
                distributionParams: {
                    intensity: 3,
                    startMonth: 0,
                    duration: 12,
                    ...distributionParams
                }
            };
            
            this.projectData.budgetCategories.push(category);
            this.calculateProjections(category.id);
            this.debouncedSave();
            this.renderBudgetTable();
            this.updateProjectSummary();
            
            showNotification(`Category "${name}" added successfully`, 'success');
            console.log(`Budget category added: ${category.id}`);
            return category.id;
        } catch (error) {
            console.error('Error adding budget category:', error);
            showNotification('Failed to add category: ' + error.message, 'error');
            return null;
        }
    }

    updateBudgetCategory(id, updates) {
        console.log(`Updating budget category: ${id}`);
        
        try {
            const category = this.projectData.budgetCategories.find(c => c.id === id);
            if (!category) {
                throw new Error('Category not found');
            }
            
            Object.assign(category, updates);
            
            const validation = validateBudgetCategory(category);
            if (validation.length > 0) {
                throw new Error(validation.join(', '));
            }
            
            this.calculateProjections(id);
            this.debouncedSave();
            this.renderBudgetTable();
            this.updateProjectSummary();
            
            showNotification('Category updated successfully', 'success');
            console.log(`Budget category updated: ${id}`);
        } catch (error) {
            console.error('Error updating budget category:', error);
            showNotification('Failed to update category: ' + error.message, 'error');
        }
    }

    deleteBudgetCategory(id) {
        if (!confirm('Are you sure you want to delete this category?')) {
            return;
        }
        
        console.log(`Deleting budget category: ${id}`);
        
        try {
            const category = this.projectData.budgetCategories.find(c => c.id === id);
            if (!category) {
                throw new Error('Category not found');
            }
            
            this.projectData.budgetCategories = this.projectData.budgetCategories.filter(c => c.id !== id);
            
            Object.keys(this.projectData.scenarios).forEach(scenarioId => {
                delete this.projectData.scenarios[scenarioId].projections[id];
                delete this.projectData.scenarios[scenarioId].actuals[id];
            });
            
            this.debouncedSave();
            this.renderBudgetTable();
            this.updateProjectSummary();
            
            showNotification(`Category "${category.name}" deleted`, 'success');
            console.log(`Budget category deleted: ${id}`);
        } catch (error) {
            console.error('Error deleting budget category:', error);
            showNotification('Failed to delete category: ' + error.message, 'error');
        }
    }

    editBudgetCategory(id) {
        const category = this.projectData.budgetCategories.find(c => c.id === id);
        if (!category) {
            console.error(`Category not found for editing: ${id}`);
            return;
        }

        console.log(`Editing budget category: ${id}`);

        const modal = document.getElementById('modal-container');
        if (modal) {
            modal.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 class="modal-title">Edit Budget Category</h3>
                            <button onclick="app.closeModal()" class="modal-close">×</button>
                        </div>
                        <form id="edit-budget-form" data-category-id="${id}">
                            <div class="form-group">
                                <label>Category Code</label>
                                <input type="text" name="code" value="${category.code}" required>
                            </div>
                            <div class="form-group">
                                <label>Category Name</label>
                                <input type="text" name="name" value="${category.name}" required>
                            </div>
                            <div class="form-group">
                                <label>Amount</label>
                                <input type="number" name="amount" value="${category.amount}" step="0.01" required>
                            </div>
                            <div class="form-group">
                                <label>Cost Type</label>
                                <select name="costType" required>
                                    <option value="Hard" ${category.costType === 'Hard' ? 'selected' : ''}>Hard Costs</option>
                                    <option value="Soft" ${category.costType === 'Soft' ? 'selected' : ''}>Soft Costs</option>
                                    <option value="TI" ${category.costType === 'TI' ? 'selected' : ''}>Tenant Improvements</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Distribution Method</label>
                                <select name="distributionMethod" required>
                                    <option value="s-curve" ${category.distributionMethod === 's-curve' ? 'selected' : ''}>S-Curve Distribution</option>
                                    <option value="straight-line" ${category.distributionMethod === 'straight-line' ? 'selected' : ''}>Straight Line</option>
                                    <option value="manual" ${category.distributionMethod === 'manual' ? 'selected' : ''}>Manual Input</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>S-Curve Intensity</label>
                                <input type="range" name="intensity" min="1" max="5" value="${category.distributionParams.intensity || 3}">
                                <div class="flex justify-between text-sm text-gray-500 mt-1">
                                    <span>Flat</span>
                                    <span>Steep</span>
                                </div>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Start Month</label>
                                    <input type="number" name="startMonth" value="${category.distributionParams.startMonth || 0}" min="0" max="23">
                                </div>
                                <div class="form-group">
                                    <label>Duration (months)</label>
                                    <input type="number" name="duration" value="${category.distributionParams.duration || 12}" min="1">
                                </div>
                            </div>
                            <div class="form-actions">
                                <button type="button" onclick="app.closeModal()" class="btn-secondary">Cancel</button>
                                <button type="submit" class="btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            modal.style.display = 'block';
            
            // Add keyboard support
            document.addEventListener('keydown', this.handleModalKeyboard);
            
            // Focus first input
            setTimeout(() => {
                const firstInput = modal.querySelector('input, select, textarea');
                if (firstInput) firstInput.focus();
            }, 100);
            
            document.getElementById('edit-budget-form').addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const categoryId = parseInt(e.target.dataset.categoryId);
                
                this.updateBudgetCategory(categoryId, {
                    code: formData.get('code'),
                    name: formData.get('name'),
                    amount: parseFloat(formData.get('amount')),
                    costType: formData.get('costType'),
                    distributionMethod: formData.get('distributionMethod'),
                    distributionParams: {
                        intensity: parseInt(formData.get('intensity')),
                        startMonth: parseInt(formData.get('startMonth')),
                        duration: parseInt(formData.get('duration'))
                    }
                });
                
                this.closeModal();
            });
        }
    }

    calculateProjections(categoryId) {
        console.log(`Calculating projections for category: ${categoryId}`);
        
        try {
            const category = this.projectData.budgetCategories.find(c => c.id === categoryId);
            if (!category) {
                throw new Error('Category not found');
            }

            Object.keys(this.projectData.scenarios).forEach(scenarioId => {
                const scenario = this.projectData.scenarios[scenarioId];
                if (!scenario.projections[categoryId]) {
                    scenario.projections[categoryId] = {};
                }
                if (scenario.adjustments && scenario.adjustments[categoryId] === undefined) {
                    scenario.adjustments[categoryId] = category.amount;
                }

                const projections = this.calculations.calculateDistribution(
                    category.amount,
                    category.distributionMethod,
                    category.distributionParams,
                    24
                );

                scenario.projections[categoryId] = projections;
            });
            
            this.debouncedSave();
        } catch (error) {
            console.error('Error calculating projections:', error);
            showNotification('Failed to calculate projections: ' + error.message, 'error');
        }
    }

    recalculateBaseline() {
        console.log('Recalculating baseline projections...');
        
        if (!confirm('This will recalculate all projections based on current settings. Continue?')) {
            return;
        }

        showLoading('Recalculating projections...');
        
        try {
            this.projectData.budgetCategories.forEach(category => {
                this.calculateProjections(category.id);
            });
            
            this.renderBudgetTable();
            this.updateProjectSummary();
            
            hideLoading();
            showNotification('Baseline recalculated successfully', 'success');
        } catch (error) {
            console.error('Error recalculating baseline:', error);
            hideLoading();
            showNotification('Failed to recalculate baseline: ' + error.message, 'error');
        }
    }

    updateActualSpend(categoryId, month, amount) {
        console.log(`Updating actual spend - Category: ${categoryId}, Month: ${month}, Amount: ${amount}`);
        
        try {
            const scenario = this.projectData.scenarios[this.projectData.currentScenario];
            if (!scenario.actuals[categoryId]) {
                scenario.actuals[categoryId] = {};
            }
            
            scenario.actuals[categoryId][month] = parseFloat(amount) || 0;
            this.debouncedSave();
            this.renderBudgetTable();
            this.updateProjectSummary();
        } catch (error) {
            console.error('Error updating actual spend:', error);
            showNotification('Failed to update actual spend: ' + error.message, 'error');
        }
    }

    showActualsModal(categoryId) {
        showNotification('Navigate to Reports page to enter actuals', 'info');
    }

    createScenario(name, baseScenarioId = 'baseline') {
        console.log(`Creating scenario: ${name}`);
        
        try {
            if (!name || name.trim() === '') {
                throw new Error('Scenario name is required');
            }
            
            const scenarioId = 'scenario_' + Date.now();
            const baseScenario = this.projectData.scenarios[baseScenarioId];
            
            if (!baseScenario) {
                throw new Error('Base scenario not found');
            }
            
            this.projectData.scenarios[scenarioId] = {
                name: name,
                projections: JSON.parse(JSON.stringify(baseScenario.projections)),
                actuals: JSON.parse(JSON.stringify(baseScenario.actuals)),
                isLocked: false,
                adjustments: JSON.parse(JSON.stringify(baseScenario.adjustments || {}))
            };
            
            this.debouncedSave();
            this.loadScenarios();
            
            showNotification(`Scenario "${name}" created`, 'success');
            return scenarioId;
        } catch (error) {
            console.error('Error creating scenario:', error);
            showNotification('Failed to create scenario: ' + error.message, 'error');
            return null;
        }
    }

    switchScenario(scenarioId) {
        console.log(`Switching to scenario: ${scenarioId}`);
        
        if (this.projectData.scenarios[scenarioId]) {
            this.projectData.currentScenario = scenarioId;
            this.debouncedSave();
            this.renderBudgetTable();
            this.updateProjectSummary();
            
            showNotification(`Switched to scenario: ${this.projectData.scenarios[scenarioId].name}`, 'info');
        }
    }

    loadScenarios() {
        console.log('Loading scenarios');
        const selector = document.getElementById('scenario-selector');
        if (selector) {
            selector.innerHTML = '';
            
            Object.keys(this.projectData.scenarios).forEach(scenarioId => {
                const scenario = this.projectData.scenarios[scenarioId];
                const option = document.createElement('option');
                option.value = scenarioId;
                option.textContent = scenario.name;
                option.selected = scenarioId === this.projectData.currentScenario;
                selector.appendChild(option);
            });
            
            console.log(`Loaded ${Object.keys(this.projectData.scenarios).length} scenarios`);
        }
    }

    renderBudgetTable() {
        console.log('Rendering budget table');
        const container = document.getElementById('budget-table-body');
        if (!container) {
            console.warn('Budget table body not found');
            return;
        }

        const scenario = this.projectData.scenarios[this.projectData.currentScenario];

        if (this.projectData.budgetCategories.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: var(--medium-gray);">
                        No budget categories added yet. Click "Add Category" to get started.
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = '';
        
        this.projectData.budgetCategories.forEach(category => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-tooltip="Category code: ${category.code}">${category.code}</td>
                <td data-tooltip="${category.name}">${category.name}</td>
                <td data-tooltip="Total budget: $${category.amount.toLocaleString()}">
                    $${category.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </td>
                <td>
                    <span class="cost-type ${category.costType.toLowerCase()}"
                          data-tooltip="${category.costType} costs">
                        ${category.costType}
                    </span>
                </td>
                <td data-tooltip="Distribution: ${category.distributionMethod}">
                    ${this.formatDistributionMethod(category.distributionMethod)}
                </td>
                <td>
                    <div class="flex gap-1">
                        <button onclick="app.editBudgetCategory(${category.id})" 
                                class="btn-icon"
                                data-tooltip="Edit this category">
                            ✏️
                        </button>
                        <button onclick="app.deleteBudgetCategory(${category.id})" 
                                class="btn-icon"
                                data-tooltip="Delete this category">
                            🗑️
                        </button>
                        <button onclick="app.showActualsModal(${category.id})" 
                                class="btn-icon"
                                data-tooltip="Enter actual spending">
                            📊
                        </button>
                    </div>
                </td>
            `;
            container.appendChild(row);
            
            row.querySelectorAll('[data-tooltip]').forEach(el => this.addTooltip(el));
        });

        console.log(`Budget table rendered with ${this.projectData.budgetCategories.length} categories`);
    }

    formatDistributionMethod(method) {
        const methods = {
            's-curve': 'S-Curve',
            'straight-line': 'Straight Line',
            'manual': 'Manual'
        };
        return methods[method] || method;
    }

    updateProjectSummary() {
        console.log('Updating project summary');
        
        try {
            const totalBudget = this.projectData.budgetCategories.reduce((sum, cat) => sum + cat.amount, 0);
            const scenario = this.projectData.scenarios[this.projectData.currentScenario];
            
            let totalProjected = 0;
            let totalActual = 0;
            
            this.projectData.budgetCategories.forEach(category => {
                const projections = scenario.projections[category.id] || {};
                const actuals = scenario.actuals[category.id] || {};
                
                Object.values(projections).forEach(val => totalProjected += val || 0);
                Object.values(actuals).forEach(val => totalActual += val || 0);
            });

            const totalBudgetEl = document.getElementById('total-budget');
            const totalProjectedEl = document.getElementById('total-projected');
            const totalActualEl = document.getElementById('total-actual');
            const totalRemainingEl = document.getElementById('total-remaining');

            if (totalBudgetEl) totalBudgetEl.textContent = '$' + totalBudget.toLocaleString(undefined, {maximumFractionDigits: 0});
            if (totalProjectedEl) totalProjectedEl.textContent = '$' + totalProjected.toLocaleString(undefined, {maximumFractionDigits: 0});
            if (totalActualEl) totalActualEl.textContent = '$' + totalActual.toLocaleString(undefined, {maximumFractionDigits: 0});
            if (totalRemainingEl) {
                const remaining = totalBudget - totalActual;
                totalRemainingEl.textContent = '$' + remaining.toLocaleString(undefined, {maximumFractionDigits: 0});
                totalRemainingEl.className = 'value ' + (remaining < 0 ? 'text-red-600' : '');
            }
            
            const guide = document.getElementById('getting-started-guide');
            if (guide) {
                guide.style.display = this.projectData.budgetCategories.length > 0 ? 'none' : 'block';
            }
            
            console.log(`Summary updated - Budget: $${totalBudget}, Projected: $${totalProjected}, Actual: $${totalActual}`);
        } catch (error) {
            console.error('Error updating project summary:', error);
        }
    }

    updateProjectInfo() {
        console.log('Updating project info forms');
        const info = this.projectData.info;
        
        const projectNameField = document.getElementById('project-name');
        if (projectNameField) projectNameField.value = info.name || '';
        
        const clientNameField = document.getElementById('client-name');
        if (clientNameField) clientNameField.value = info.client || '';
        
        const locationField = document.getElementById('project-location');
        if (locationField) locationField.value = info.location || '';
        
        const managerField = document.getElementById('project-manager');
        if (managerField) managerField.value = info.manager || '';
    }

    showProjectCreationDialog() {
        const modal = document.getElementById('modal-container');
        if (!modal) return;

        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Create New Project</h3>
                    </div>
                    <p class="mb-4">Welcome to Cashflow Pro! Create your first project to get started.</p>
                    <form id="create-project-form">
                        <div class="form-group required">
                            <label>Project Name</label>
                            <input type="text" 
                                   name="projectName" 
                                   placeholder="Enter project name" 
                                   required
                                   data-tooltip="Enter a descriptive name for your project">
                            <span class="form-helper-text">
                                Example: "Downtown Office Building" or "Retail Plaza Phase 2"
                            </span>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn-primary">Create Project</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        modal.style.display = 'block';
        
        // Add keyboard support
        document.addEventListener('keydown', this.handleModalKeyboard);
        
        // Focus input
        setTimeout(() => {
            const input = modal.querySelector('input[name="projectName"]');
            if (input) input.focus();
        }, 100);
        
        document.getElementById('create-project-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const projectName = e.target.projectName.value;
            this.createNewProject(projectName);
            this.closeModal();
        });
    }

    showNewProjectModal() {
        this.showProjectCreationDialog();
    }

    showAddBudgetModal() {
        console.log('Showing add budget modal');
        const modal = document.getElementById('modal-container');
        if (!modal) return;

        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Add Budget Category</h3>
                        <button onclick="app.closeModal()" class="modal-close">×</button>
                    </div>
                    <form id="add-budget-form">
                        <div class="form-group required">
                            <label>Category Code</label>
                            <input type="text" 
                                   name="code" 
                                   placeholder="e.g., 1000, A-100" 
                                   required
                                   data-tooltip="Unique identifier or CSI code">
                            <span class="form-helper-text">
                                Use CSI codes or your own numbering system
                            </span>
                        </div>
                        <div class="form-group required">
                            <label>Category Name</label>
                            <input type="text" 
                                   name="name" 
                                   placeholder="e.g., Site Acquisition, A/E Fees" 
                                   required
                                   data-tooltip="Descriptive name for this category">
                        </div>
                        <div class="form-group required">
                            <label>Budget Amount</label>
                            <input type="number" 
                                   name="amount" 
                                   step="0.01" 
                                   min="0"
                                   placeholder="0.00" 
                                   required
                                   data-tooltip="Total budget for this category">
                        </div>
                        <div class="form-group required">
                            <label>Cost Type</label>
                            <select name="costType" required data-tooltip="Type of construction cost">
                                <option value="Hard">Hard Costs</option>
                                <option value="Soft">Soft Costs</option>
                                <option value="TI">Tenant Improvements</option>
                            </select>
                            <span class="form-helper-text">
                                Hard = Construction, Soft = Professional Services, TI = Tenant Work
                            </span>
                        </div>
                        <div class="form-group required">
                            <label>Distribution Method</label>
                            <select name="distributionMethod" 
                                    required 
                                    onchange="toggleDistributionParams(this.value)"
                                    data-tooltip="How spending is distributed over time">
                                <option value="s-curve">S-Curve Distribution</option>
                                <option value="straight-line">Straight Line</option>
                                <option value="manual">Manual Input</option>
                            </select>
                        </div>
                        
                        <div id="distribution-params">
                            <div class="form-group">
                                <label>S-Curve Intensity</label>
                                <input type="range" name="intensity" min="1" max="5" value="3">
                                <div class="flex justify-between text-sm text-gray-500 mt-1">
                                    <span>Flat</span>
                                    <span>Steep</span>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="form-group">
                                    <label>Start Month</label>
                                    <input type="number" name="startMonth" min="0" max="23" value="0">
                                </div>
                                <div class="form-group">
                                    <label>Duration (months)</label>
                                    <input type="number" name="duration" min="1" value="12">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-actions">
                            <button type="button" onclick="app.closeModal()" class="btn-secondary">
                                Cancel
                            </button>
                            <button type="submit" class="btn-primary">
                                Add Category
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        modal.style.display = 'block';
        
        // Add keyboard support
        document.addEventListener('keydown', this.handleModalKeyboard);
        
        // Focus first input
        setTimeout(() => {
            const firstInput = modal.querySelector('input, select, textarea');
            if (firstInput) firstInput.focus();
        }, 100);
        
        document.getElementById('add-budget-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddBudgetForm(e.target);
        });
        
        setTimeout(() => {
            modal.querySelectorAll('[data-tooltip]').forEach(el => this.addTooltip(el));
        }, 100);
    }

    handleAddBudgetForm(form) {
        const formData = new FormData(form);
        
        const distributionParams = {
            intensity: parseInt(formData.get('intensity')) || 3,
            startMonth: parseInt(formData.get('startMonth')) || 0,
            duration: parseInt(formData.get('duration')) || 12
        };
        
        this.addBudgetCategory(
            formData.get('code'),
            formData.get('name'),
            formData.get('amount'),
            formData.get('costType'),
            formData.get('distributionMethod'),
            distributionParams
        );
        
        this.closeModal();
    }

    // ENHANCED: Keyboard support for modals
    handleModalKeyboard = (e) => {
        if (e.key === 'Escape') {
            this.closeModal();
        }
    }

    closeModal() {
        const modal = document.getElementById('modal-container');
        if (modal) {
            modal.style.display = 'none';
            modal.innerHTML = '';
            // Remove keyboard listener
            document.removeEventListener('keydown', this.handleModalKeyboard);
        }
    }

    exportData() {
        if (!this.currentProjectId) {
            showNotification('No project selected', 'error');
            return;
        }
        
        console.log('Exporting data...');
        
        try {
            const data = {
                projectData: this.projectData,
                exportDate: new Date().toISOString(),
                version: '1.0',
                exportedBy: window.authManager.currentUser.email
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `cashflow-${this.projectData.info.name}-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            showNotification('Data exported successfully', 'success');
            console.log('Data exported');
        } catch (error) {
            console.error('Export error:', error);
            showNotification('Failed to export data: ' + error.message, 'error');
        }
    }

    importData() {
        console.log('Importing data...');
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                showLoading('Importing data...');
                
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (data.projectData) {
                            if (confirm('This will replace current project data. Continue?')) {
                                this.projectData = data.projectData;
                                await this.saveCurrentProject();
                                await this.loadCurrentProject();
                                
                                hideLoading();
                                showNotification('Data imported successfully', 'success');
                                console.log('Data imported successfully');
                            } else {
                                hideLoading();
                            }
                        } else {
                            throw new Error('Invalid data format');
                        }
                    } catch (error) {
                        console.error('Import error:', error);
                        hideLoading();
                        showNotification('Error importing data: ' + error.message, 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        document.addEventListener('change', (e) => {
            if (e.target.id === 'project-selector') {
                this.loadProject(e.target.value);
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.matches('[data-action="signout"]')) {
                this.handleSignOut();
            }
        });
        
        window.addEventListener('scroll', () => {
            const tooltipEl = document.getElementById('active-tooltip');
            if (tooltipEl) tooltipEl.remove();
        }, true);
    }

    async handleSignOut() {
        if (confirm('Are you sure you want to sign out?')) {
            showLoading('Signing out...');
            const result = await window.authManager.signOut();
            if (result.success) {
                window.location.href = 'login.html';
            }
        }
    }

    setupTooltips() {
        document.querySelectorAll('[data-tooltip]').forEach(element => {
            this.addTooltip(element);
        });
    }

    // FIXED: Tooltip positioning near cursor
    addTooltip(element) {
        const tooltip = element.getAttribute('data-tooltip');
        if (!tooltip) return;
        
        if (element._tooltipEnter) {
            element.removeEventListener('mouseenter', element._tooltipEnter);
            element.removeEventListener('mouseleave', element._tooltipLeave);
        }
        
        element._tooltipEnter = (e) => {
            const existing = document.getElementById('active-tooltip');
            if (existing) existing.remove();
            
            const tooltipEl = document.createElement('div');
            tooltipEl.className = 'tooltip';
            tooltipEl.textContent = tooltip;
            tooltipEl.id = 'active-tooltip';
            
            document.body.appendChild(tooltipEl);
            
            // Position near cursor instead of element
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            // Offset slightly below and to the right of cursor
            tooltipEl.style.position = 'fixed';
            tooltipEl.style.left = (mouseX + 12) + 'px';
            tooltipEl.style.top = (mouseY + 12) + 'px';
            tooltipEl.style.transform = 'none';
            
            // Ensure tooltip doesn't go off-screen
            setTimeout(() => {
                const rect = tooltipEl.getBoundingClientRect();
                if (rect.right > window.innerWidth) {
                    tooltipEl.style.left = (mouseX - rect.width - 12) + 'px';
                }
                if (rect.bottom > window.innerHeight) {
                    tooltipEl.style.top = (mouseY - rect.height - 12) + 'px';
                }
            }, 0);
            
            setTimeout(() => tooltipEl.classList.add('show'), 10);
        };
        
        element._tooltipLeave = () => {
            const tooltipEl = document.getElementById('active-tooltip');
            if (tooltipEl) {
                tooltipEl.classList.remove('show');
                setTimeout(() => {
                    if (tooltipEl.parentNode) tooltipEl.remove();
                }, 200);
            }
        };
        
        element.addEventListener('mouseenter', element._tooltipEnter);
        element.addEventListener('mouseleave', element._tooltipLeave);
    }
}

// ============================================================================
// CALCULATION ENGINE
// ============================================================================

class CalculationEngine {
    calculateDistribution(amount, method, params, maxMonths) {
        try {
            switch (method) {
                case 's-curve':
                    return this.calculateSCurve(amount, params, maxMonths);
                case 'straight-line':
                    return this.calculateStraightLine(amount, params, maxMonths);
                case 'manual':
                    return params.manualDistribution || {};
                default:
                    return this.calculateStraightLine(amount, params, maxMonths);
            }
        } catch (error) {
            console.error('Calculation error:', error);
            showNotification('Error calculating distribution: ' + error.message, 'error');
            return {};
        }
    }

    calculateSCurve(amount, params, maxMonths) {
        const { intensity = 3, startMonth = 0, duration = 12 } = params;
        const distribution = {};
        
        const steepness = intensity * 0.5;
        const midpoint = duration / 2;
        
        let total = 0;
        const monthlyValues = [];
        
        for (let month = 0; month < duration; month++) {
            const x = month - midpoint;
            const value = 1 / (1 + Math.exp(-steepness * x / midpoint));
            monthlyValues.push(value);
            total += value;
        }
        
        for (let month = 0; month < duration; month++) {
            const monthIndex = startMonth + month;
            if (monthIndex < maxMonths) {
                distribution[monthIndex] = (monthlyValues[month] / total) * amount;
            }
        }
        
        return distribution;
    }

    calculateStraightLine(amount, params, maxMonths) {
        const { startMonth = 0, duration = 12 } = params;
        const distribution = {};
        const monthlyAmount = amount / duration;
        
        for (let month = 0; month < duration; month++) {
            const monthIndex = startMonth + month;
            if (monthIndex < maxMonths) {
                distribution[monthIndex] = monthlyAmount;
            }
        }
        
        return distribution;
    }
}

// ============================================================================
// VISUALIZATION ENGINE - ENHANCED ERROR HANDLING
// ============================================================================

class VisualizationEngine {
    constructor(app) {
        this.app = app;
    }

    // ENHANCED: Robust chart rendering with validation
    renderCashflowChart(containerId, data, options = {}) {
        try {
            const container = document.getElementById(containerId);
            if (!container) {
                console.error(`Container not found: ${containerId}`);
                return;
            }

            // Validate data structure
            if (!data || !data.budgetCategories || !data.scenarios) {
                console.warn('Invalid data structure for chart rendering');
                container.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--medium-gray);">
                        <div style="text-align: center;">
                            <p style="font-size: 48px; margin-bottom: 1rem;">📊</p>
                            <p>No data available for chart</p>
                            <p style="font-size: 14px; margin-top: 0.5rem;">Add budget categories to see your cashflow projection</p>
                        </div>
                    </div>
                `;
                return;
            }

            if (this.app.chartInstances.has(containerId)) {
                this.app.chartInstances.get(containerId).dispose();
            }

            const chart = echarts.init(container);
            this.app.chartInstances.set(containerId, chart);
            
            const chartOption = this.buildChartOption(data);
            chart.setOption(chartOption);
            
            window.addEventListener('resize', () => {
                if (chart && !chart.isDisposed()) {
                    chart.resize();
                }
            });
            
        } catch (error) {
            console.error('Chart rendering error:', error);
            showNotification('Failed to render chart: ' + error.message, 'error');
        }
    }

    buildChartOption(data) {
        const months = [];
        const plannedData = [];
        const actualData = [];
        const cumulativePlanned = [];
        const cumulativeActual = [];
        
        let runningPlanned = 0;
        let runningActual = 0;
        
        const scenario = data.scenarios[data.currentScenario];
        
        for (let month = 0; month < 24; month++) {
            const monthDate = new Date();
            monthDate.setMonth(monthDate.getMonth() + month);
            months.push(monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
            
            let monthlyPlanned = 0;
            let monthlyActual = 0;
            
            data.budgetCategories.forEach(category => {
                const projections = scenario.projections[category.id] || {};
                const actuals = scenario.actuals[category.id] || {};
                
                monthlyPlanned += projections[month] || 0;
                monthlyActual += actuals[month] || 0;
            });
            
            plannedData.push(monthlyPlanned);
            actualData.push(monthlyActual);
            
            runningPlanned += monthlyPlanned;
            runningActual += monthlyActual;
            
            cumulativePlanned.push(runningPlanned);
            cumulativeActual.push(runningActual);
        }

        return {
            title: {
                text: 'Cashflow Projection',
                textStyle: { color: '#1B365D', fontSize: 18, fontWeight: 'bold' }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                formatter: function(params) {
                    let result = params[0].name + '<br/>';
                    params.forEach(param => {
                        result += `${param.seriesName}: $${param.value.toLocaleString()}<br/>`;
                    });
                    return result;
                }
            },
            legend: {
                data: ['Planned', 'Actual', 'Cumulative Planned', 'Cumulative Actual'],
                top: 30
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: months,
                axisLabel: { rotate: 45 }
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'Monthly Spend',
                    position: 'left',
                    axisLabel: {
                        formatter: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'K';
                        }
                    }
                },
                {
                    type: 'value',
                    name: 'Cumulative',
                    position: 'right',
                    axisLabel: {
                        formatter: function(value) {
                            return '$' + (value / 1000).toFixed(0) + 'K';
                        }
                    }
                }
            ],
            series: [
                {
                    name: 'Planned',
                    type: 'bar',
                    data: plannedData,
                    itemStyle: { color: '#1B365D' }
                },
                {
                    name: 'Actual',
                    type: 'bar',
                    data: actualData,
                    itemStyle: { color: '#407EC9' }
                },
                {
                    name: 'Cumulative Planned',
                    type: 'line',
                    yAxisIndex: 1,
                    data: cumulativePlanned,
                    itemStyle: { color: '#EAAA00' },
                    smooth: true
                },
                {
                    name: 'Cumulative Actual',
                    type: 'line',
                    yAxisIndex: 1,
                    data: cumulativeActual,
                    itemStyle: { color: '#505759' },
                    smooth: true
                }
            ],
            dataZoom: [
                {
                    type: 'inside',
                    start: 0,
                    end: 100
                }
            ]
        };
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

window.toggleDistributionParams = function(method) {
    const paramsDiv = document.getElementById('distribution-params');
    if (paramsDiv) {
        paramsDiv.style.display = method === 's-curve' ? 'block' : 'none';
    }
};

// ============================================================================
// APPLICATION INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    try {
        window.app = new CashflowApp();
    } catch (error) {
        console.error('App initialization error:', error);
        showNotification('Failed to initialize application', 'error');
    }
});

// ============================================================================
// CLEANUP
// ============================================================================

window.addEventListener('beforeunload', () => {
    if (window.app && window.app.chartInstances) {
        window.app.chartInstances.forEach(chart => {
            if (chart && !chart.isDisposed()) {
                chart.dispose();
            }
        });
    }
    
    if (window.app && window.app.unsubscribeCallbacks) {
        window.app.unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
    }
});
