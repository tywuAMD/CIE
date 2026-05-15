// Reservation System JavaScript

class ReservationSystem {
    constructor() {
        this.apiBaseUrl = window.RESERVATION_API_BASE_URL || 'http://localhost:4100/api';
        this.authMode = 'login';
        this.currentUser = null;
        this.platforms = [];
        this.selectedPlatform = null;
        this.selectedDate = null;
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.pendingSlotStartTime = null;
        this.reservations = [];
        this.selectedDayReservations = [];
        this.selectedDayBookedHours = new Set();
        this.isLoadingAvailability = false;
        this.availabilityRequestId = 0;
        this.workspaceStatusByReservation = new Map();
        this.workspacePollingTimer = null;
        this.workspacePollInFlight = false;
        this.workspacePollingIntervalMs = 4000;
        this.unavailablePlatformKeys = new Set(['node#2', 'node2'].map((name) => this.normalizePlatformKey(name)));

        this.init().catch((error) => {
            console.error('Initialization error:', error);
            this.showLoginScreen(`Initialization failed: ${error.message}`);
        });
    }

    async init() {
        this.resetFormInputs();
        this.renderPlatformsLoadingState();
        this.setupEventListeners();
        this.setDateConstraints();
        this.updateReservationSectionVisibility();
        this.updateQuickDateButtonState();
        this.updateSelectionSummary();
        this.updateActionState();

        const existingUser = await this.fetchCurrentUser();
        if (!existingUser) {
            this.showLoginScreen();
            return;
        }

        this.currentUser = existingUser;
        await this.bootstrapAppData();
        if (!this.currentUser) {
            return;
        }
        this.showAppScreen();
    }

    resetFormInputs() {
        // Reset all form inputs to default on page load
        document.getElementById('dateInput').value = '';
        document.getElementById('startTime').value = '';
        document.getElementById('duration').value = '';
    }

    renderPlatformsLoadingState() {
        const container = document.getElementById('platformSelector');
        if (!container) return;
        container.innerHTML = '<p class="empty-state">Loading platforms...</p>';
    }

    showSyncError(messageText) {
        if (!this.currentUser) {
            this.setLoginMessage(messageText, 'error');
            return;
        }

        const message = document.getElementById('availabilityMessage');
        if (!message) return;
        message.className = 'availability-message unavailable';
        message.textContent = messageText;
    }

    setLoginMessage(messageText = '', type = '') {
        const message = document.getElementById('loginMessage');
        if (!message) return;
        message.className = `auth-message${type ? ` ${type}` : ''}`;
        message.textContent = messageText;
    }

    showLoginScreen(messageText = '', messageType = '', mode = 'login') {
        const authScreen = document.getElementById('authScreen');
        const appContainer = document.getElementById('appContainer');

        if (authScreen) {
            authScreen.classList.remove('hidden');
        }
        if (appContainer) {
            appContainer.classList.add('hidden');
        }

        this.setAuthMode(mode);

        if (messageText) {
            this.setLoginMessage(messageText, messageType || 'error');
        } else {
            this.setLoginMessage('');
        }
    }

    setAuthMode(mode = 'login') {
        const normalizedMode = mode === 'reset' ? 'reset' : 'login';
        this.authMode = normalizedMode;

        const title = document.getElementById('authTitle');
        const hint = document.getElementById('authHint');
        const loginForm = document.getElementById('loginForm');
        const resetPasswordForm = document.getElementById('resetPasswordForm');
        const authSwitch = document.querySelector('.auth-switch');
        const showLoginBtn = document.getElementById('showLoginBtn');
        const showResetPasswordBtn = document.getElementById('showResetPasswordBtn');

        if (title) {
            title.textContent = normalizedMode === 'reset' ? 'Reset Password' : 'Team Login';
        }

        if (hint) {
            hint.textContent = normalizedMode === 'reset'
                ? 'Use your assigned username and current password to set a new password.'
                : 'Please sign in with your team account to make reservations.';
        }

        if (loginForm) {
            loginForm.classList.toggle('hidden', normalizedMode !== 'login');
        }

        if (resetPasswordForm) {
            resetPasswordForm.classList.toggle('hidden', normalizedMode !== 'reset');
        }

        if (showLoginBtn) {
            const isActive = normalizedMode === 'login';
            showLoginBtn.classList.toggle('active', isActive);
            showLoginBtn.setAttribute('aria-selected', String(isActive));
        }

        if (showResetPasswordBtn) {
            const isActive = normalizedMode === 'reset';
            showResetPasswordBtn.classList.toggle('active', isActive);
            showResetPasswordBtn.setAttribute('aria-selected', String(isActive));
        }

        if (authSwitch) {
            authSwitch.classList.toggle('alt-active', normalizedMode === 'reset');
        }

        const focusId = normalizedMode === 'reset' ? 'resetUsername' : 'loginUsername';
        const input = document.getElementById(focusId);
        if (input) {
            input.focus();
        }
    }

    showAppScreen() {
        const authScreen = document.getElementById('authScreen');
        const appContainer = document.getElementById('appContainer');

        if (authScreen) {
            authScreen.classList.add('hidden');
        }
        if (appContainer) {
            appContainer.classList.remove('hidden');
        }

        this.setLoginMessage('');
        this.updateCurrentUserLabel();
    }

    updateCurrentUserLabel() {
        const userLabel = document.getElementById('currentUserLabel');
        if (!userLabel) return;

        if (!this.currentUser) {
            userLabel.textContent = 'Not signed in';
            this.updateHeaderActions();
            this.updateReservationsScopeHint();
            return;
        }

        const roleSuffix = this.currentUser.role === 'admin' ? ' (Admin)' : '';
        userLabel.textContent = `${this.currentUser.username}${roleSuffix}`;
        this.updateHeaderActions();
        this.updateReservationsScopeHint();
    }

    updateHeaderActions() {
        const headerHintText = document.getElementById('headerHintText');
        const oneClickAdminLink = document.getElementById('oneClickAdminLink');
        const normalizedUsername = String(this.currentUser?.username || '').trim().toLowerCase();
        const isAdminUser = normalizedUsername === 'admin' || this.currentUser?.role === 'admin';

        if (headerHintText) {
            headerHintText.textContent = isAdminUser
                ? 'Reserve platforms and launch notebooks from active reservations. Admin tools are available below.'
                : 'Reserve platforms and launch notebooks from active reservations.';
        }

        if (oneClickAdminLink) {
            oneClickAdminLink.classList.toggle('hidden', !isAdminUser);
        }
    }

    updateReservationsScopeHint() {
        const hint = document.getElementById('reservationsScopeHint');
        if (!hint) return;

        if (!this.currentUser) {
            hint.textContent = 'Reservations appear after login.';
            return;
        }

        if (this.currentUser.role === 'admin') {
            hint.textContent = 'Admin view: all teams\' reservations are listed here and can be canceled.';
            return;
        }

        hint.textContent = 'Your team reservations appear here and can be canceled anytime.';
    }

    handleUnauthorized(error) {
        if (!error || error.status !== 401) {
            return false;
        }

        this.currentUser = null;
        this.workspaceStatusByReservation.clear();
        this.stopWorkspacePolling();
        this.showLoginScreen('Session expired. Please log in again.', 'error');
        return true;
    }

    async apiRequest(path, options = {}) {
        const response = await fetch(`${this.apiBaseUrl}${path}`, {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            ...options
        });

        let payload = null;
        if (response.status !== 204) {
            payload = await response.json().catch(() => null);
        }

        if (!response.ok) {
            const errorMessage = payload?.error || `Request failed (${response.status})`;
            const requestError = new Error(errorMessage);
            requestError.status = response.status;
            requestError.payload = payload;
            throw requestError;
        }

        return payload;
    }

    async fetchCurrentUser() {
        try {
            const payload = await this.apiRequest('/auth/me');
            return payload?.user || null;
        } catch (error) {
            if (error.status === 401) {
                return null;
            }
            throw error;
        }
    }

    async bootstrapAppData() {
        this.renderPlatformsLoadingState();
        try {
            await this.cleanupExpiredReservations();
            await Promise.all([
                this.loadPlatformsFromApi(),
                this.syncReservationsFromApi()
            ]);
            this.renderPlatforms();
            this.updateCurrentUserLabel();
        } catch (error) {
            if (this.handleUnauthorized(error)) {
                return;
            }
            throw error;
        }
    }

    async loadPlatformsFromApi() {
        const payload = await this.apiRequest('/platforms');
        this.platforms = (payload?.platforms || []).map((platform) => platform.name);
    }

    async cleanupExpiredReservations() {
        try {
            const payload = await this.apiRequest('/reservations/cleanup-expired', {
                method: 'POST'
            });
            return payload?.deletedCount || 0;
        } catch (error) {
            if (this.handleUnauthorized(error)) {
                return 0;
            }
            throw error;
        }
    }

    async syncReservationsFromApi(filters = {}) {
        const query = new URLSearchParams();
        if (filters.platform) query.set('platform', filters.platform);
        if (filters.date) query.set('date', filters.date);

        const suffix = query.toString() ? `?${query.toString()}` : '';
        const payload = await this.apiRequest(`/reservations${suffix}`);
        this.reservations = payload?.reservations || [];
        this.renderReservationsList();
        await this.syncWorkspaceStatusesForActiveReservations();
    }

    async refreshSelectedAvailability(showErrorMessage = true) {
        if (!this.currentUser) {
            return false;
        }

        if (!this.selectedPlatform || !this.selectedDate) {
            this.selectedDayReservations = [];
            this.selectedDayBookedHours = new Set();
            this.isLoadingAvailability = false;
            this.updateTimeSlotSelection();
            return true;
        }

        const requestId = ++this.availabilityRequestId;
        this.isLoadingAvailability = true;
        this.updateTimeSlotSelection();

        try {
            const query = new URLSearchParams({
                platform: this.selectedPlatform,
                date: this.selectedDate
            });

            const payload = await this.apiRequest(`/availability?${query.toString()}`);
            if (requestId !== this.availabilityRequestId) {
                return false;
            }

            const slots = payload?.slots || [];
            this.selectedDayBookedHours = new Set(
                slots
                    .filter((slot) => slot.reserved)
                    .map((slot) => Number(slot.hour))
            );
            this.selectedDayReservations = payload?.reservations || [];

            this.isLoadingAvailability = false;
            this.updateTimeSlotSelection();
            this.updateSelectionSummary();
            this.updateActionState();
            return true;
        } catch (error) {
            if (requestId !== this.availabilityRequestId) {
                return false;
            }

            if (this.handleUnauthorized(error)) {
                return false;
            }

            this.selectedDayReservations = [];
            this.selectedDayBookedHours = new Set();
            this.isLoadingAvailability = false;
            this.updateTimeSlotSelection();
            this.updateSelectionSummary();
            this.updateActionState();
            if (showErrorMessage) {
                this.showSyncError(`Unable to load availability: ${error.message}`);
            }
            return false;
        }
    }

    renderPlatforms() {
        const container = document.getElementById('platformSelector');
        if (!container) return;
        container.innerHTML = '';

        if (this.platforms.length === 0) {
            container.innerHTML = '<p class="empty-state">No active platforms found in backend.</p>';
            return;
        }

        this.platforms.forEach(platform => {
            const isUnavailable = this.isPlatformTemporarilyUnavailable(platform);
            const card = document.createElement('div');
            card.className = `platform-card${isUnavailable ? ' unavailable' : ''}`;
            card.innerHTML = `
                <span class="platform-name">${platform}</span>
                <span class="platform-status">${isUnavailable ? 'Unavailable (NodeB down)' : 'Available'}</span>
            `;

            if (!isUnavailable) {
                if (this.selectedPlatform === platform) {
                    card.classList.add('selected');
                }
                card.addEventListener('click', () => this.selectPlatform(platform));
            } else {
                card.setAttribute('aria-disabled', 'true');
                card.title = `${platform} is temporarily unavailable while NodeB is down.`;
            }

            container.appendChild(card);
        });
    }

    selectPlatform(platform) {
        if (this.isPlatformTemporarilyUnavailable(platform)) {
            this.showSyncError(`${platform} is temporarily unavailable while NodeB is down.`);
            return;
        }

        this.selectedPlatform = platform;
        this.pendingSlotStartTime = null;
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.selectedDayReservations = [];
        this.selectedDayBookedHours = new Set();
        this.isLoadingAvailability = Boolean(this.selectedDate);
        document.getElementById('startTime').value = '';
        document.getElementById('duration').value = '';
        
        // Update visual selection
        const cards = document.querySelectorAll('.platform-card');
        cards.forEach(card => {
            if (card.querySelector('.platform-name').textContent === platform) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });

        // Reset other selections and update visibility
        this.clearAvailabilityMessage();
        this.updateReservationSectionVisibility();
        this.updateSelectionSummary();
        this.updateActionState();

        if (this.selectedDate) {
            this.refreshSelectedAvailability();
        }
    }

    setupEventListeners() {
        const loginForm = document.getElementById('loginForm');
        const resetPasswordForm = document.getElementById('resetPasswordForm');
        const showLoginBtn = document.getElementById('showLoginBtn');
        const showResetPasswordBtn = document.getElementById('showResetPasswordBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const dateInput = document.getElementById('dateInput');
        const startTimeInput = document.getElementById('startTime');
        const durationInput = document.getElementById('duration');
        const makeReservationBtn = document.getElementById('makeReservationBtn');
        const form = document.getElementById('reservationForm');
        const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
        const closeModal = document.getElementById('closeModal');
        const reservationsList = document.getElementById('reservationsList');

        loginForm.addEventListener('submit', (e) => this.handleLoginSubmit(e));
        resetPasswordForm.addEventListener('submit', (e) => this.handleResetPasswordSubmit(e));
        showLoginBtn.addEventListener('click', () => {
            this.setAuthMode('login');
            this.setLoginMessage('');
        });
        showResetPasswordBtn.addEventListener('click', () => {
            this.setAuthMode('reset');
            this.setLoginMessage('');
        });
        logoutBtn.addEventListener('click', () => this.handleLogout());
        dateInput.addEventListener('change', () => this.handleDateChange());
        startTimeInput.addEventListener('change', () => this.handleSelectionChange());
        durationInput.addEventListener('change', () => this.handleSelectionChange());
        makeReservationBtn.addEventListener('click', () => this.showConfirmationModal());
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        cancelConfirmBtn.addEventListener('click', () => this.closeConfirmationModal());
        closeModal.addEventListener('click', () => this.closeSuccessModal());

        const quickDateButtons = document.querySelectorAll('.quick-date-btn');
        quickDateButtons.forEach(button => {
            button.addEventListener('click', () => {
                const offset = parseInt(button.dataset.offset, 10);
                if (!Number.isNaN(offset)) {
                    this.selectQuickDate(offset);
                }
            });
        });

        if (reservationsList) {
            reservationsList.addEventListener('click', (event) => {
                const launchBtn = event.target.closest('.workspace-btn.launch-btn[data-reservation-id]');
                if (launchBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (launchBtn.disabled) {
                        return;
                    }
                    const reservationId = this.normalizeReservationId(launchBtn.dataset.reservationId);
                    this.handleLaunchWorkspace(reservationId);
                    return;
                }

                const openBtn = event.target.closest('.workspace-btn.open-btn[data-reservation-id]');
                if (openBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (openBtn.disabled) {
                        return;
                    }
                    const reservationId = this.normalizeReservationId(openBtn.dataset.reservationId);
                    this.openWorkspaceForReservation(reservationId);
                    return;
                }

                const interactiveTarget = event.target.closest('button, a, input, select, textarea, label');
                if (interactiveTarget) {
                    return;
                }

                const card = event.target.closest('.reservation-card.clickable[data-reservation-id]');
                if (!card) {
                    return;
                }

                const reservationId = card.dataset.reservationId;
                this.handleActiveReservationCardClick(this.normalizeReservationId(reservationId));
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;

            const confirmationModal = document.getElementById('confirmationModal');
            const successModal = document.getElementById('successModal');

            if (confirmationModal.classList.contains('show')) {
                this.closeConfirmationModal();
            } else if (successModal.classList.contains('show')) {
                this.closeSuccessModal();
            }
        });

        // Close modals when clicking outside
        const confirmationModal = document.getElementById('confirmationModal');
        confirmationModal.addEventListener('click', (e) => {
            if (e.target === confirmationModal) {
                this.closeConfirmationModal();
            }
        });

        const successModal = document.getElementById('successModal');
        successModal.addEventListener('click', (e) => {
            if (e.target === successModal) {
                this.closeSuccessModal();
            }
        });
    }

    async handleLoginSubmit(e) {
        e.preventDefault();

        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const loginButton = document.getElementById('loginBtn');

        if (loginButton) {
            loginButton.disabled = true;
        }
        this.setLoginMessage('Signing in...');

        try {
            const payload = await this.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });

            if (!payload?.user) {
                throw new Error('Login response is invalid.');
            }

            this.currentUser = payload.user;
            this.selectedPlatform = null;
            this.selectedDate = null;
            this.selectedDayReservations = [];
            this.selectedDayBookedHours = new Set();
            this.resetFormInputs();
            await this.bootstrapAppData();
            if (!this.currentUser) {
                return;
            }
            this.showAppScreen();
            document.getElementById('loginPassword').value = '';
            this.updateReservationSectionVisibility();
            this.updateSelectionSummary();
            this.updateActionState();
        } catch (error) {
            this.currentUser = null;
            this.showLoginScreen(`Login failed: ${error.message}`, 'error', 'login');
        } finally {
            if (loginButton) {
                loginButton.disabled = false;
            }
        }
    }

    async handleResetPasswordSubmit(e) {
        e.preventDefault();

        const username = document.getElementById('resetUsername').value.trim();
        const currentPassword = document.getElementById('resetCurrentPassword').value;
        const newPassword = document.getElementById('resetNewPassword').value;
        const confirmNewPassword = document.getElementById('resetNewPasswordConfirm').value;
        const resetButton = document.getElementById('resetPasswordBtn');

        if (newPassword !== confirmNewPassword) {
            this.setLoginMessage('Password reset failed: new passwords do not match.', 'error');
            return;
        }

        if (newPassword === currentPassword) {
            this.setLoginMessage('Password reset failed: new password must be different.', 'error');
            return;
        }

        if (resetButton) {
            resetButton.disabled = true;
        }
        this.setLoginMessage('Updating password...');

        try {
            await this.apiRequest('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ username, currentPassword, newPassword })
            });

            document.getElementById('resetCurrentPassword').value = '';
            document.getElementById('resetNewPassword').value = '';
            document.getElementById('resetNewPasswordConfirm').value = '';

            const loginUsername = document.getElementById('loginUsername');
            if (loginUsername) {
                loginUsername.value = username;
            }
            const loginPassword = document.getElementById('loginPassword');
            if (loginPassword) {
                loginPassword.value = '';
            }

            this.showLoginScreen('Password updated. Please log in with your new password.', 'success', 'login');
        } catch (error) {
            this.showLoginScreen(`Password reset failed: ${error.message}`, 'error', 'reset');
        } finally {
            if (resetButton) {
                resetButton.disabled = false;
            }
        }
    }

    async handleLogout() {
        try {
            await this.apiRequest('/auth/logout', {
                method: 'POST'
            });
        } catch (error) {
            console.error('Logout request failed:', error);
        }

        this.currentUser = null;
        this.platforms = [];
        this.reservations = [];
        this.selectedPlatform = null;
        this.selectedDate = null;
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.pendingSlotStartTime = null;
        this.selectedDayReservations = [];
        this.selectedDayBookedHours = new Set();
        this.isLoadingAvailability = false;
        this.availabilityRequestId += 1;
        this.workspaceStatusByReservation.clear();
        this.stopWorkspacePolling();
        this.workspacePollInFlight = false;

        this.resetFormInputs();
        this.renderPlatformsLoadingState();
        this.renderReservationsList();
        this.updateReservationSectionVisibility();
        this.updateSelectionSummary();
        this.updateActionState();
        this.updateReservationsScopeHint();
        this.showLoginScreen('Logged out successfully.', 'success');
    }

    handleSelectionChange() {
        const startTime = document.getElementById('startTime').value;
        const duration = document.getElementById('duration').value;

        if (!startTime || duration) {
            this.pendingSlotStartTime = null;
        } else if (this.pendingSlotStartTime) {
            // Keep pending start in sync if user edits start time after first click
            this.pendingSlotStartTime = startTime;
        }

        this.clearAvailabilityMessage();
        this.updateTimeSlotSelection();
        this.updateSelectionSummary();
        this.updateActionState();
    }

    updateTimeSlotSelection() {
        const startTime = document.getElementById('startTime').value;
        const duration = document.getElementById('duration').value;

        if (!this.selectedPlatform || !this.selectedDate) {
            this.renderTimeSlots();
            return;
        }

        if (startTime && !duration && this.pendingSlotStartTime) {
            const pendingStartHour = parseInt(this.pendingSlotStartTime.split(':')[0], 10);
            if (!Number.isNaN(pendingStartHour)) {
                this.renderTimeSlots([pendingStartHour], false, true);
                return;
            }
        }

        if (!startTime || !duration) {
            this.renderTimeSlots();
            return;
        }

        const durationHours = parseInt(duration);
        const endTime = this.addHoursToTime(startTime, durationHours);
        
        // Check if extends past midnight
        if (this.timeToMinutes(endTime) < this.timeToMinutes(startTime)) {
            this.renderTimeSlots();
            return;
        }

        // Get affected hours
        const startHour = parseInt(startTime.split(':')[0]);
        const endHour = parseInt(endTime.split(':')[0]);
        const endMinute = parseInt(endTime.split(':')[1]);
        
        // Calculate which hours are affected
        const affectedHours = [];
        for (let h = startHour; h < endHour || (h === endHour && endMinute > 0); h++) {
            if (h < 24) {
                affectedHours.push(h);
            }
        }

        // Check for conflicts
        const conflicts = this.checkForConflicts(this.selectedPlatform, this.selectedDate, startTime, endTime);
        const hasConflict = conflicts.length > 0;

        // Re-render with selection
        this.renderTimeSlots(affectedHours, hasConflict, false);
    }

    setDateConstraints() {
        const dateInput = document.getElementById('dateInput');
        const today = new Date();
        
        // Set min date to today
        dateInput.min = this.formatDate(today);
        
        // Don't set a default value - let it show placeholder
        this.selectedDate = null;
        this.updateQuickDateButtonState();
    }

    updateReservationSectionVisibility() {
        const reservationSection = document.getElementById('reservationSection');
        const selectedPlatformUnavailable = this.isPlatformTemporarilyUnavailable(this.selectedPlatform);

        if (this.selectedPlatform && this.selectedDate && !selectedPlatformUnavailable) {
            reservationSection.style.display = 'block';
            this.renderTimeSlots();
        } else {
            reservationSection.style.display = 'none';
        }
    }

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatDateDisplay(dateString) {
        const date = new Date(dateString + 'T00:00:00');
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatTime(time) {
        // Convert 24h format to 12h format
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${hour12}:${minutes} ${ampm}`;
    }

    addHoursToTime(time, hours) {
        const [h, m] = time.split(':').map(Number);
        const totalMinutes = h * 60 + m + (hours * 60);
        const newHours = Math.floor(totalMinutes / 60) % 24;
        const newMinutes = totalMinutes % 60;
        return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
    }

    normalizePlatformKey(platformName) {
        return String(platformName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    isPlatformTemporarilyUnavailable(platformName) {
        const normalizedKey = this.normalizePlatformKey(platformName);
        return this.unavailablePlatformKeys.has(normalizedKey);
    }

    timeToMinutes(time) {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    getWorkspaceStatusMeta(workspace) {
        const status = String(workspace?.status || 'not_found').toLowerCase();
        const statusMessage = workspace?.message ? this.escapeHtml(workspace.message) : '';

        if (status === 'ready') {
            return {
                className: 'ready',
                label: 'Notebook Ready',
                message: statusMessage || 'Notebook is ready to open.'
            };
        }

        if (['allocating', 'pending', 'loading', 'initializing', 'jupyter_starting', 'running'].includes(status)) {
            return {
                className: 'pending',
                label: 'Launching',
                message: statusMessage || 'Preparing notebook environment...'
            };
        }

        if (status === 'failed') {
            return {
                className: 'failed',
                label: 'Launch Failed',
                message: statusMessage || 'Notebook launch failed. Try again.'
            };
        }

        return {
            className: 'idle',
            label: 'Not Launched',
            message: statusMessage || 'Launch notebook during your active reservation.'
        };
    }

    isWorkspacePendingStatus(status) {
        const normalized = String(status || '').toLowerCase();
        return ['allocating', 'pending', 'loading', 'initializing', 'jupyter_starting', 'running'].includes(normalized);
    }

    normalizeUserKey(value) {
        return String(value || '').trim().toLowerCase();
    }

    normalizeReservationId(value) {
        return String(value || '').trim();
    }

    isUuidReservationId(value) {
        const normalized = this.normalizeReservationId(value);
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
    }

    getValidReservationId(value) {
        const normalized = this.normalizeReservationId(value);
        return this.isUuidReservationId(normalized) ? normalized : '';
    }

    isReservationOwnedByCurrentUser(reservation) {
        if (!this.currentUser) {
            return false;
        }

        const currentUserKey = this.normalizeUserKey(this.currentUser.username);
        if (!currentUserKey) {
            return false;
        }

        const ownerKey = this.normalizeUserKey(reservation?.owner);
        const reservationNameKey = this.normalizeUserKey(reservation?.name);
        return ownerKey === currentUserKey || reservationNameKey === currentUserKey;
    }

    canUseWorkspaceActionsForReservation(reservation) {
        if (!this.currentUser) {
            return false;
        }

        const isActive = this.getReservationVisualState(reservation) === 'active';
        if (!isActive) {
            return false;
        }

        if (this.currentUser.role === 'admin') {
            return this.isReservationOwnedByCurrentUser(reservation);
        }

        return true;
    }

    canTrackWorkspaceForReservation(reservation) {
        if (!this.currentUser) {
            return false;
        }

        if (this.currentUser.role === 'admin') {
            return this.isReservationOwnedByCurrentUser(reservation);
        }

        return true;
    }

    getReservationsForWorkspaceSync() {
        if (!this.currentUser) {
            return [];
        }

        return this.reservations.filter((reservation) => this.canTrackWorkspaceForReservation(reservation));
    }

    getActiveReservationsForWorkspace() {
        if (!this.currentUser) {
            return [];
        }

        return this.reservations.filter((reservation) => this.canUseWorkspaceActionsForReservation(reservation));
    }

    async syncWorkspaceStatusesForActiveReservations(options = {}) {
        if (!this.currentUser) {
            if (this.workspaceStatusByReservation.size > 0) {
                this.workspaceStatusByReservation.clear();
            }
            this.stopWorkspacePolling();
            return;
        }

        if (options.fromPolling && this.workspacePollInFlight) {
            return;
        }

        const trackedReservations = this.getReservationsForWorkspaceSync();
        const reservationsToSync = options.fromPolling
            ? this.getActiveReservationsForWorkspace()
            : trackedReservations;
        const trackedIds = new Set(
            trackedReservations
                .map((reservation) => this.getValidReservationId(reservation.id))
                .filter(Boolean)
        );

        Array.from(this.workspaceStatusByReservation.keys()).forEach((reservationId) => {
            if (!trackedIds.has(reservationId)) {
                this.workspaceStatusByReservation.delete(reservationId);
            }
        });

        if (reservationsToSync.length === 0) {
            this.stopWorkspacePolling();
            return;
        }

        this.workspacePollInFlight = true;
        let changed = false;

        try {
            await Promise.all(
                reservationsToSync.map(async (reservation) => {
                    const reservationId = this.getValidReservationId(reservation.id);
                    if (!reservationId) {
                        return;
                    }

                    try {
                        const query = new URLSearchParams({ reservationId });
                        const payload = await this.apiRequest(`/workspaces/status?${query.toString()}`);
                        const workspace = payload?.workspace;

                        if (!workspace || workspace.status === 'not_found') {
                            if (this.workspaceStatusByReservation.delete(reservationId)) {
                                changed = true;
                            }
                            return;
                        }

                        const previous = this.workspaceStatusByReservation.get(reservationId);
                        if (JSON.stringify(previous || null) !== JSON.stringify(workspace)) {
                            this.workspaceStatusByReservation.set(reservationId, workspace);
                            changed = true;
                        }
                    } catch (error) {
                        if (this.handleUnauthorized(error)) {
                            return;
                        }
                        if (!options.fromPolling) {
                            this.showSyncError(`Unable to sync notebook status: ${error.message}`);
                        }
                    }
                })
            );
        } finally {
            this.workspacePollInFlight = false;
        }

        if (changed) {
            this.renderReservationsList();
        }

        this.reconcileWorkspacePolling();
    }

    startWorkspacePolling() {
        if (this.workspacePollingTimer) {
            return;
        }

        this.workspacePollingTimer = setInterval(() => {
            this.syncWorkspaceStatusesForActiveReservations({ fromPolling: true });
        }, this.workspacePollingIntervalMs);
    }

    stopWorkspacePolling() {
        if (!this.workspacePollingTimer) {
            return;
        }

        clearInterval(this.workspacePollingTimer);
        this.workspacePollingTimer = null;
    }

    reconcileWorkspacePolling() {
        const activeReservations = this.getActiveReservationsForWorkspace();
        if (activeReservations.length === 0) {
            this.stopWorkspacePolling();
            return;
        }

        const hasPending = activeReservations.some((reservation) => {
            const reservationId = this.getValidReservationId(reservation.id);
            if (!reservationId) {
                return false;
            }
            const workspace = this.workspaceStatusByReservation.get(reservationId);
            return this.isWorkspacePendingStatus(workspace?.status);
        });

        if (hasPending) {
            this.startWorkspacePolling();
        } else {
            this.stopWorkspacePolling();
        }
    }

    async handleLaunchWorkspace(reservationId) {
        const normalizedReservationId = this.normalizeReservationId(reservationId);
        const validReservationId = this.getValidReservationId(normalizedReservationId);
        const isAdmin = this.currentUser?.role === 'admin';

        if (normalizedReservationId && !validReservationId && isAdmin) {
            this.showSyncError('Invalid reservation identifier for admin launch. Refresh the page and try again.');
            return;
        }

        const requestBody = validReservationId ? { reservationId: validReservationId } : {};

        try {
            const payload = await this.apiRequest('/workspaces/request', {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });
            const workspace = payload?.workspace;
            const workspaceReservationId = this.getValidReservationId(workspace?.reservationId) || validReservationId;

            if (workspace && workspace.status !== 'not_found' && workspaceReservationId) {
                this.workspaceStatusByReservation.set(workspaceReservationId, workspace);
            } else if (workspaceReservationId) {
                this.workspaceStatusByReservation.delete(workspaceReservationId);
            }

            this.renderReservationsList();
            this.reconcileWorkspacePolling();
            await this.syncWorkspaceStatusesForActiveReservations();
        } catch (error) {
            if (this.handleUnauthorized(error)) {
                return;
            }
            this.showSyncError(`Failed to launch notebook: ${error.message}`);
        }
    }

    openWorkspaceForReservation(reservationId) {
        const validReservationId = this.getValidReservationId(reservationId);
        const workspace = validReservationId ? this.workspaceStatusByReservation.get(validReservationId) : null;
        const url = workspace?.url;

        if (!url) {
            this.showSyncError('Notebook URL is not ready yet.');
            return;
        }

        window.open(url, '_blank', 'noopener');
    }

    async handleActiveReservationCardClick(reservationId) {
        const validReservationId = this.getValidReservationId(reservationId);
        const workspace = validReservationId ? (this.workspaceStatusByReservation.get(validReservationId) || null) : null;
        const status = String(workspace?.status || '').toLowerCase();

        if (status === 'ready' && workspace?.url) {
            this.openWorkspaceForReservation(validReservationId);
            return;
        }

        if (this.isWorkspacePendingStatus(status)) {
            this.showSyncError('Notebook is still launching. Please wait a moment and click again.');
            return;
        }

        await this.handleLaunchWorkspace(validReservationId || reservationId);
    }

    renderWorkspaceActions(reservation) {
        const reservationId = this.normalizeReservationId(reservation.id);
        const validReservationId = this.getValidReservationId(reservationId);
        const workspace = validReservationId ? (this.workspaceStatusByReservation.get(validReservationId) || null) : null;
        const statusMeta = this.getWorkspaceStatusMeta(workspace);
        const workspaceStatus = String(workspace?.status || '').toLowerCase();
        const isPending = this.isWorkspacePendingStatus(workspace?.status);
        const hasUrl = Boolean(workspace?.url);
        const canOpen = workspaceStatus === 'ready' && hasUrl;
        const launchLabel = isPending ? 'Launching...' : (workspace ? 'Relaunch Notebook' : 'Launch Notebook');

        return `
            <div class="workspace-panel">
                <div class="workspace-status ${statusMeta.className}">
                    <div class="workspace-status-label">${statusMeta.label}</div>
                    <div class="workspace-status-message">${statusMeta.message}</div>
                </div>
                <div class="workspace-actions">
                    <button type="button" class="workspace-btn launch-btn" id="launch-${reservationId}" data-reservation-id="${reservationId}" ${isPending ? 'disabled' : ''}>${launchLabel}</button>
                    <button type="button" class="workspace-btn open-btn" id="open-${reservationId}" data-reservation-id="${reservationId}" ${canOpen ? '' : 'disabled'}>Open Notebook</button>
                </div>
            </div>
        `;
    }

    getReservationVisualState(reservation) {
        if (!reservation?.date || !reservation?.time || !reservation?.duration) {
            return 'upcoming';
        }

        const startTime = reservation.time.length === 5 ? reservation.time : reservation.time.slice(0, 5);
        const start = new Date(`${reservation.date}T${startTime}:00`);
        const durationHours = Number(reservation.duration);

        if (Number.isNaN(start.getTime()) || !Number.isFinite(durationHours) || durationHours <= 0) {
            return 'upcoming';
        }

        const end = new Date(start.getTime() + (durationHours * 60 * 60 * 1000));
        const now = new Date();
        if (now >= end) {
            return 'inactive';
        }
        if (now >= start) {
            return 'active';
        }
        return 'upcoming';
    }

    isDateToday(dateString) {
        if (!dateString) return false;
        return dateString === this.formatDate(new Date());
    }

    isPastSlotHour(dateString, hour) {
        if (!this.isDateToday(dateString)) return false;
        const now = new Date();
        return hour < now.getHours();
    }

    isPastStartTime(dateString, startTime) {
        if (!dateString || !startTime) return false;
        const startHour = parseInt(startTime.split(':')[0], 10);
        if (Number.isNaN(startHour)) return false;
        return this.isPastSlotHour(dateString, startHour);
    }

    selectQuickDate(offsetDays) {
        const targetDate = new Date();
        targetDate.setHours(0, 0, 0, 0);
        targetDate.setDate(targetDate.getDate() + offsetDays);

        const formattedDate = this.formatDate(targetDate);
        const dateInput = document.getElementById('dateInput');
        dateInput.value = formattedDate;
        this.selectedDate = formattedDate;
        this.pendingSlotStartTime = null;
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.selectedDayReservations = [];
        this.selectedDayBookedHours = new Set();
        this.isLoadingAvailability = Boolean(this.selectedPlatform && this.selectedDate);
        document.getElementById('startTime').value = '';
        document.getElementById('duration').value = '';

        this.clearAvailabilityMessage();
        this.updateQuickDateButtonState();
        this.updateReservationSectionVisibility();
        this.updateSelectionSummary();
        this.updateActionState();
        this.refreshSelectedAvailability();
    }

    updateQuickDateButtonState() {
        const dateInput = document.getElementById('dateInput');
        const selectedDateValue = dateInput.value;
        const quickDateButtons = document.querySelectorAll('.quick-date-btn');

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        quickDateButtons.forEach(button => {
            const offset = parseInt(button.dataset.offset, 10);
            if (Number.isNaN(offset)) {
                button.classList.remove('active');
                button.setAttribute('aria-pressed', 'false');
                return;
            }

            const buttonDate = new Date(today);
            buttonDate.setDate(today.getDate() + offset);
            const formattedButtonDate = this.formatDate(buttonDate);
            const isActive = selectedDateValue === formattedButtonDate;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', String(isActive));
        });
    }

    getSelectionStatus() {
        const startTime = document.getElementById('startTime').value;
        const durationValue = document.getElementById('duration').value;

        if (!this.selectedPlatform && !this.selectedDate) {
            return {
                className: 'pending',
                label: 'Waiting',
                note: 'Start by selecting a platform and date.',
                isReady: false
            };
        }

        if (!this.selectedPlatform) {
            return {
                className: 'pending',
                label: 'Waiting',
                note: 'Select a platform to continue.',
                isReady: false
            };
        }

        if (this.isPlatformTemporarilyUnavailable(this.selectedPlatform)) {
            return {
                className: 'conflict',
                label: 'Unavailable',
                note: `${this.selectedPlatform} is temporarily unavailable while NodeB is down.`,
                isReady: false
            };
        }

        if (!this.selectedDate) {
            return {
                className: 'pending',
                label: 'Waiting',
                note: 'Select a date to check availability.',
                isReady: false
            };
        }

        if (!startTime) {
            return {
                className: 'pending',
                label: 'Waiting',
                note: 'Choose a start time and duration.',
                isReady: false
            };
        }

        if (this.isPastStartTime(this.selectedDate, startTime)) {
            return {
                className: 'conflict',
                label: 'Invalid',
                note: 'Past time slots cannot be reserved for today.',
                isReady: false
            };
        }

        if (!durationValue) {
            const waitingNote = this.pendingSlotStartTime
                ? 'Start time selected. Click a same or later slot to set end time.'
                : 'Choose a duration to proceed.';

            return {
                className: 'pending',
                label: 'Waiting',
                note: waitingNote,
                isReady: false
            };
        }

        const duration = parseInt(durationValue, 10);
        if (Number.isNaN(duration) || duration <= 0) {
            return {
                className: 'pending',
                label: 'Waiting',
                note: 'Enter a valid duration to proceed.',
                isReady: false
            };
        }

        const endTime = this.addHoursToTime(startTime, duration);
        if (this.timeToMinutes(endTime) < this.timeToMinutes(startTime)) {
            return {
                className: 'conflict',
                label: 'Invalid',
                note: 'Reservation cannot extend past midnight.',
                isReady: false
            };
        }

        const conflicts = this.checkForConflicts(this.selectedPlatform, this.selectedDate, startTime, endTime);
        if (conflicts.length > 0) {
            return {
                className: 'conflict',
                label: 'Conflict',
                note: `Selected time overlaps with ${conflicts[0].name}'s reservation.`,
                isReady: false
            };
        }

        return {
            className: 'ready',
            label: 'Ready',
            note: 'Everything looks good. Review and confirm your reservation.',
            isReady: true
        };
    }

    updateSelectionSummary() {
        const platformField = document.getElementById('summaryPlatform');
        const dateField = document.getElementById('summaryDate');
        const timeField = document.getElementById('summaryTime');
        const statusField = document.getElementById('summaryStatus');
        const noteField = document.getElementById('summaryNote');

        if (!platformField || !dateField || !timeField || !statusField || !noteField) {
            return;
        }

        const startTime = document.getElementById('startTime').value;
        const durationValue = document.getElementById('duration').value;
        const duration = parseInt(durationValue, 10);

        platformField.textContent = this.selectedPlatform || 'Not selected';
        dateField.textContent = this.selectedDate ? this.formatDateDisplay(this.selectedDate) : 'Not selected';

        if (startTime && !Number.isNaN(duration) && duration > 0) {
            const endTime = this.addHoursToTime(startTime, duration);
            timeField.textContent = `${this.formatTime(startTime)} - ${this.formatTime(endTime)}`;
        } else {
            timeField.textContent = 'Not selected';
        }

        const status = this.getSelectionStatus();
        statusField.textContent = status.label;
        statusField.className = `status-chip ${status.className}`;
        noteField.textContent = status.note;

        this.updateStepIndicators(status);
    }

    updateActionState() {
        const button = document.getElementById('makeReservationBtn');
        if (!button) return;

        const status = this.getSelectionStatus();
        button.disabled = !status.isReady;
        button.title = status.isReady
            ? 'Review reservation before final confirmation'
            : status.note;
    }

    updateStepIndicators(status = this.getSelectionStatus()) {
        const steps = document.querySelectorAll('.booking-steps .step-item');
        if (steps.length !== 3) return;

        const hasPlatform = Boolean(this.selectedPlatform);
        const hasDate = Boolean(this.selectedDate);

        const completion = [
            hasPlatform,
            hasPlatform && hasDate,
            status.isReady
        ];

        steps.forEach((step, index) => {
            step.classList.remove('active', 'current', 'completed');

            if (completion[index]) {
                step.classList.add('completed');
            }
        });

        const currentIndex = completion.findIndex((item) => !item);
        steps[currentIndex === -1 ? steps.length - 1 : currentIndex].classList.add('current');
    }

    handleDateChange() {
        const dateInput = document.getElementById('dateInput');
        this.selectedDate = dateInput.value || null;
        this.pendingSlotStartTime = null;
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.selectedDayReservations = [];
        this.selectedDayBookedHours = new Set();
        this.isLoadingAvailability = Boolean(this.selectedPlatform && this.selectedDate);
        document.getElementById('startTime').value = '';
        document.getElementById('duration').value = '';
        this.clearAvailabilityMessage();
        this.updateQuickDateButtonState();
        this.updateReservationSectionVisibility();
        this.updateSelectionSummary();
        this.updateActionState();

        if (this.selectedDate && this.selectedPlatform) {
            this.refreshSelectedAvailability();
        }
    }

    clearAvailabilityMessage() {
        const message = document.getElementById('availabilityMessage');
        message.className = 'availability-message';
        message.innerHTML = '';
    }
    
    clearSelection() {
        document.getElementById('startTime').value = '';
        document.getElementById('duration').value = '';
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.pendingSlotStartTime = null;
        this.clearAvailabilityMessage();
        this.updateReservationSectionVisibility();
        this.updateSelectionSummary();
        this.updateActionState();
    }

    resetSelectionSummary() {
        const reservationForm = document.getElementById('reservationForm');
        const dateInput = document.getElementById('dateInput');
        const platformCards = document.querySelectorAll('.platform-card');

        if (reservationForm) {
            reservationForm.reset();
        }
        if (dateInput) {
            dateInput.value = '';
        }

        platformCards.forEach((card) => card.classList.remove('selected'));

        this.selectedPlatform = null;
        this.selectedDate = null;
        this.pendingSlotStartTime = null;
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.selectedDayReservations = [];
        this.selectedDayBookedHours = new Set();
        this.isLoadingAvailability = false;

        this.clearAvailabilityMessage();
        this.updateQuickDateButtonState();
        this.updateReservationSectionVisibility();
        this.updateSelectionSummary();
        this.updateActionState();
    }

    resetReservationDetails(messageText = '') {
        this.clearSelection();

        if (!messageText) return;

        const message = document.getElementById('availabilityMessage');
        message.className = 'availability-message unavailable';
        message.textContent = messageText;
    }

    async showConfirmationModal() {
        const startTime = document.getElementById('startTime').value;
        const duration = document.getElementById('duration').value;
        const messageDiv = document.getElementById('availabilityMessage');

        // Clear previous messages
        messageDiv.className = 'availability-message';
        messageDiv.innerHTML = '';

        if (!this.selectedPlatform) {
            messageDiv.className = 'availability-message unavailable';
            messageDiv.innerHTML = '⚠️ Please select a platform first.';
            return;
        }

        if (!this.selectedDate) {
            messageDiv.className = 'availability-message unavailable';
            messageDiv.innerHTML = '⚠️ Please select a date first.';
            return;
        }

        if (!startTime) {
            messageDiv.className = 'availability-message unavailable';
            messageDiv.innerHTML = '⚠️ Please select a start time.';
            return;
        }

        if (this.isPastStartTime(this.selectedDate, startTime)) {
            messageDiv.className = 'availability-message unavailable';
            messageDiv.innerHTML = '⚠️ Past time slots cannot be reserved for today.';
            return;
        }

        if (!duration) {
            messageDiv.className = 'availability-message unavailable';
            messageDiv.innerHTML = '⚠️ Please select a duration.';
            return;
        }

        const durationHours = parseInt(duration);
        const endTime = this.addHoursToTime(startTime, durationHours);
        
        // Check if reservation goes beyond midnight
        if (this.timeToMinutes(endTime) < this.timeToMinutes(startTime)) {
            messageDiv.className = 'availability-message unavailable';
            messageDiv.innerHTML = '⚠️ Reservation cannot extend past midnight. Please choose an earlier start time or shorter duration.';
            return;
        }

        const availabilityLoaded = await this.refreshSelectedAvailability(true);
        if (!availabilityLoaded) {
            return;
        }

        // Check for conflicts
        const conflicts = this.checkForConflicts(this.selectedPlatform, this.selectedDate, startTime, endTime);
        
        if (conflicts.length > 0) {
            messageDiv.className = 'availability-message unavailable';
            messageDiv.innerHTML = `❌ Time slot is unavailable for ${this.selectedPlatform}. Conflicts with existing reservation(s):<br>`;
            conflicts.forEach(conflict => {
                const conflictEnd = this.addHoursToTime(conflict.time, conflict.duration);
                messageDiv.innerHTML += `<br>• ${this.formatTime(conflict.time)} - ${this.formatTime(conflictEnd)} (${conflict.name})`;
            });
            return;
        }

        // No conflicts, store selection and show confirmation modal
        this.selectedStartTime = startTime;
        this.selectedDuration = durationHours;

        const modal = document.getElementById('confirmationModal');
        const detailsDiv = document.getElementById('confirmationDetails');

        detailsDiv.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Platform:</span>
                <span class="detail-value highlight">${this.selectedPlatform}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Team:</span>
                <span class="detail-value highlight">${this.currentUser?.username || 'Unknown Team'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${this.formatDateDisplay(this.selectedDate)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Start Time:</span>
                <span class="detail-value">${this.formatTime(startTime)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">End Time:</span>
                <span class="detail-value">${this.formatTime(endTime)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Duration:</span>
                <span class="detail-value highlight">${durationHours} hour${durationHours > 1 ? 's' : ''}</span>
            </div>
        `;

        modal.classList.add('show');
        
        // Scroll to top of modal
        modal.scrollTop = 0;
    }

    closeConfirmationModal() {
        const modal = document.getElementById('confirmationModal');
        modal.classList.remove('show');
    }

    checkForConflicts(platform, date, startTime, endTime) {
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);

        const isSelectedDayContext = platform === this.selectedPlatform && date === this.selectedDate;
        const sourceReservations = isSelectedDayContext ? this.selectedDayReservations : this.reservations;

        return sourceReservations.filter(reservation => {
            if (!isSelectedDayContext) {
                if (reservation.platform !== platform) return false;
                if (reservation.date !== date) return false;
            }

            const resStartMinutes = this.timeToMinutes(reservation.time);
            const resEndTime = this.addHoursToTime(reservation.time, reservation.duration);
            const resEndMinutes = this.timeToMinutes(resEndTime);

            // Check for overlap
            return (startMinutes < resEndMinutes && endMinutes > resStartMinutes);
        });
    }

    renderTimeSlots(selectedHours = [], hasConflict = false, isSelectingEndTime = false) {
        const container = document.getElementById('timelineContainer');
        
        if (!container) return;
        
        container.innerHTML = '';

        if (!this.selectedPlatform || !this.selectedDate) {
            return;
        }

        if (this.isLoadingAvailability) {
            container.innerHTML = '<p class="empty-state">Loading availability...</p>';
            return;
        }

        // Add legend
        const legend = document.createElement('div');
        legend.className = 'timeline-legend';
        legend.innerHTML = `
            <div class="legend-item">
                <div class="legend-color available"></div>
                <span>Available</span>
            </div>
            <div class="legend-item">
                <div class="legend-color past"></div>
                <span>Past</span>
            </div>
            <div class="legend-item">
                <div class="legend-color booked"></div>
                <span>Reserved</span>
            </div>
        `;
        container.appendChild(legend);

        // Create 6x4 grid of time slots
        const grid = document.createElement('div');
        grid.className = 'timeline-grid';
        
        for (let hour = 0; hour < 24; hour++) {
            const isSelected = selectedHours.includes(hour);
            const slot = this.createTimeSlotSquare(hour, isSelected, hasConflict, isSelectingEndTime);
            grid.appendChild(slot);
        }
        
        container.appendChild(grid);
    }

    createTimeSlotSquare(hour, isSelected = false, hasConflict = false, isSelectingEndTime = false) {
        const square = document.createElement('div');
        const hourStart = `${String(hour).padStart(2, '0')}:00`;

        // Use latest availability data for the selected platform and date
        const dayReservations = this.selectedDayReservations;

        // Find reservations that overlap with this hour
        const hourStartMinutes = hour * 60;
        const hourEndMinutes = (hour + 1) * 60;

        const overlappingReservations = dayReservations.filter((reservation) => {
            const resStartMinutes = this.timeToMinutes(reservation.time);
            const resEndTime = this.addHoursToTime(reservation.time, Number(reservation.duration));
            const resEndMinutes = this.timeToMinutes(resEndTime);

            return resStartMinutes < hourEndMinutes && resEndMinutes > hourStartMinutes;
        });

        // Determine slot status
        let statusClass = 'available';
        let statusText = 'Available';
        let bookingInfo = '';
        const isFullyBooked = this.selectedDayBookedHours.has(hour);
        const isPastSlot = this.isPastSlotHour(this.selectedDate, hour);

        if (isPastSlot) {
            statusClass = 'past';
            statusText = 'Passed';
        } else if (isFullyBooked) {
            statusClass = 'booked';
            statusText = 'Reserved';
            if (overlappingReservations.length > 0) {
                bookingInfo = overlappingReservations[0].name;
            }
        }

        // Add selection highlighting
        if (isSelected && !isPastSlot) {
            if (isSelectingEndTime) {
                statusClass += ' selected-start';
                statusText = 'Start';
            } else if (hasConflict) {
                statusClass += ' selected-conflict';
                statusText = 'Conflict!';
            } else if (!isFullyBooked) {
                statusClass += ' selected-available';
                statusText = 'Your Selection';
            }
        }

        square.className = `time-slot-square ${statusClass}`;

        // Format hour for display (12-hour format)
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        const period = hour < 12 ? 'AM' : 'PM';

        square.innerHTML = `
            <div class="slot-hour">${hour12}:00</div>
            <div class="slot-period">${period}</div>
            <div class="slot-status-text">${statusText}</div>
            ${bookingInfo ? `<div class="slot-booking-info">${bookingInfo}</div>` : ''}
        `;

        // Add click handler to select start time (only if not fully booked)
        if (!isFullyBooked && !isPastSlot) {
            square.style.cursor = 'pointer';
            square.addEventListener('click', () => this.selectStartTime(hourStart));
        } else {
            square.style.cursor = 'not-allowed';
        }

        // Add tooltip for booked slots
        if (isPastSlot) {
            square.title = 'Past time slot (not reservable today)';
        } else if (overlappingReservations.length > 0) {
            let tooltipText = '';
            overlappingReservations.forEach((res) => {
                const endTime = this.addHoursToTime(res.time, res.duration);
                tooltipText += `${res.name}\n${this.formatTime(res.time)} - ${this.formatTime(endTime)}\n`;
            });
            square.title = tooltipText.trim();
        } else if (isSelected) {
            if (isSelectingEndTime) {
                square.title = 'Start time selected. Click a same or later slot to set end time';
            } else {
                square.title = hasConflict ? 'This time conflicts with an existing reservation' : 'Your selected time slot';
            }
        } else {
            square.title = this.pendingSlotStartTime
                ? 'Click to set this as end time'
                : 'Click to select this as start time';
        }

        return square;
    }

    selectStartTime(time) {
        const startTimeInput = document.getElementById('startTime');
        const durationInput = document.getElementById('duration');
        const messageDiv = document.getElementById('availabilityMessage');

        // First click: choose start time and wait for end selection.
        if (!this.pendingSlotStartTime || durationInput.value) {
            this.pendingSlotStartTime = time;
            startTimeInput.value = time;
            durationInput.value = '';
            this.selectedStartTime = null;
            this.selectedDuration = null;

            messageDiv.className = 'availability-message available';
            messageDiv.textContent = `Start time set to ${this.formatTime(time)}. Click a same or later slot to set end time.`;

            this.updateTimeSlotSelection();
            this.updateSelectionSummary();
            this.updateActionState();

            const timeInputs = document.querySelector('.time-duration-selection');
            if (timeInputs) {
                timeInputs.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            return;
        }

        const startMinutes = this.timeToMinutes(this.pendingSlotStartTime);
        const endMinutes = this.timeToMinutes(time);

        if (endMinutes < startMinutes) {
            this.resetReservationDetails('End time cannot be earlier than start time. Please select your time range again.');
            return;
        }

        const durationHours = ((endMinutes - startMinutes) / 60) + 1;
        if (!Number.isInteger(durationHours)) {
            this.resetReservationDetails('Please select full-hour start and end slots.');
            return;
        }

        startTimeInput.value = this.pendingSlotStartTime;
        durationInput.value = String(durationHours);

        if (durationInput.value !== String(durationHours)) {
            const maxDuration = durationInput.options[durationInput.options.length - 1].value;
            messageDiv.className = 'availability-message unavailable';
            messageDiv.textContent = `Selected range is ${durationHours} hours, but maximum allowed is ${maxDuration} hours. Click an earlier end slot.`;
            this.updateTimeSlotSelection();
            this.updateSelectionSummary();
            this.updateActionState();
            return;
        }

        this.pendingSlotStartTime = null;
        messageDiv.className = 'availability-message available';
        messageDiv.textContent = `Selected ${this.formatTime(startTimeInput.value)} to ${this.formatTime(time)} (${durationHours} hour${durationHours > 1 ? 's' : ''}).`;

        this.updateTimeSlotSelection();
        this.updateSelectionSummary();
        this.updateActionState();
    }


    async handleFormSubmit(e) {
        e.preventDefault();

        const teamName = this.currentUser?.username || 'team';
        const userEmail = (this.currentUser?.email || '').trim();
        const normalizedTeamForEmail = teamName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/(^\.|\.$)/g, '') || 'team';
        const fallbackEmail = `${normalizedTeamForEmail}@local.invalid`;
        const reservationEmail = userEmail || fallbackEmail;
        const submitButton = e.submitter || document.querySelector('#reservationForm button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const payload = {
                platform: this.selectedPlatform,
                date: this.selectedDate,
                startTime: this.selectedStartTime,
                duration: this.selectedDuration,
                name: teamName,
                email: reservationEmail,
                phone: '',
                notes: ''
            };

            const response = await this.apiRequest('/reservations', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const reservation = response?.reservation;
            if (!reservation) {
                throw new Error('Backend returned an invalid reservation response.');
            }

            await Promise.all([
                this.syncReservationsFromApi(),
                this.refreshSelectedAvailability(false)
            ]);
            this.updateSelectionSummary();
            this.updateActionState();

            // Close confirmation modal
            this.closeConfirmationModal();

            // Show success modal
            this.showSuccessModal(reservation);

            // Reset summary and selection state back to default
            this.resetSelectionSummary();
        } catch (error) {
            if (this.handleUnauthorized(error)) {
                return;
            }
            this.showSyncError(`Failed to create reservation: ${error.message}`);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    }

    showSuccessModal(reservation) {
        const modal = document.getElementById('successModal');
        const message = document.getElementById('confirmationMessage');
        
        const endTime = this.addHoursToTime(reservation.time, reservation.duration);
        
        message.innerHTML = `
            Your reservation has been confirmed for:<br>
            <strong>Platform: ${reservation.platform}</strong><br>
            <strong>${this.formatDateDisplay(reservation.date)}</strong><br>
            <strong>${this.formatTime(reservation.time)} - ${this.formatTime(endTime)}</strong><br>
            Duration: <strong>${reservation.duration} hour${reservation.duration > 1 ? 's' : ''}</strong><br>
            <br>
            Reserved by team: <strong>${reservation.name}</strong><br>
            You can review or cancel it anytime in the list below.
        `;

        modal.classList.add('show');
    }

    closeSuccessModal() {
        const modal = document.getElementById('successModal');
        modal.classList.remove('show');
    }

    renderReservationsList() {
        const container = document.getElementById('reservationsList');
        if (!container) return;
        
        if (this.reservations.length === 0) {
            const emptyMessage = this.currentUser?.role === 'admin'
                ? 'No reservations found across all teams yet.'
                : 'No reservations yet. Create one below to get started.';
            container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
            this.updateStepIndicators();
            return;
        }

        // Sort reservations by date and time
        const sortedReservations = [...this.reservations].sort((a, b) => {
            const dateCompare = new Date(a.date) - new Date(b.date);
            if (dateCompare !== 0) return dateCompare;
            return this.timeToMinutes(a.time) - this.timeToMinutes(b.time);
        });

        container.innerHTML = sortedReservations.map(reservation => 
            this.createReservationCard(reservation)
        ).join('');

        // Add delete button event listeners
        sortedReservations.forEach(reservation => {
            const reservationId = this.normalizeReservationId(reservation.id);
            const deleteBtn = document.getElementById(`delete-${reservationId}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.deleteReservation(reservation.id);
                });
            }
        });

        this.updateStepIndicators();
        this.reconcileWorkspacePolling();
    }

    createReservationCard(reservation) {
        const reservationId = this.normalizeReservationId(reservation.id);
        const validReservationId = this.getValidReservationId(reservationId);
        const endTime = this.addHoursToTime(reservation.time, reservation.duration);
        const isAdmin = this.currentUser?.role === 'admin';
        const ownerLabel = reservation.owner || reservation.name || 'Unknown team';
        const reservationState = this.getReservationVisualState(reservation);
        const reservationStateLabelMap = {
            active: 'Active now',
            upcoming: 'Upcoming',
            inactive: 'Inactive'
        };
        const reservationStateLabel = reservationStateLabelMap[reservationState] || 'Upcoming';
        const showWorkspaceActions = this.canUseWorkspaceActionsForReservation(reservation);
        const workspace = validReservationId ? (this.workspaceStatusByReservation.get(validReservationId) || null) : null;
        const workspaceStatus = String(workspace?.status || '').toLowerCase();
        const cardActionHint = showWorkspaceActions
            ? (workspaceStatus === 'ready' && workspace?.url
                ? 'Click card to open notebook.'
                : this.isWorkspacePendingStatus(workspaceStatus)
                    ? 'Notebook is launching...'
                    : 'Click card to launch notebook.')
            : '';
        const workspaceActions = showWorkspaceActions ? this.renderWorkspaceActions(reservation) : '';
        const clickableClass = showWorkspaceActions ? 'clickable' : '';
        return `
            <div class="reservation-card ${reservationState} ${clickableClass}" id="reservation-card-${reservationId}" data-reservation-id="${reservationId}">
                <div class="reservation-card-head">
                    <div class="reservation-card-head-left">
                        <span class="reservation-platform ${reservationState}">${reservation.platform}</span>
                        <span class="reservation-date">${this.formatDateDisplay(reservation.date)}</span>
                    </div>
                    <button class="delete-btn" id="delete-${reservationId}" title="Cancel reservation">Cancel</button>
                </div>
                <div class="reservation-time">${this.formatTime(reservation.time)} - ${this.formatTime(endTime)}</div>
                <div class="reservation-meta">
                    <span>${reservation.duration} hour${reservation.duration > 1 ? 's' : ''}</span>
                    <span>${isAdmin ? `Team: ${ownerLabel}` : reservation.name}</span>
                </div>
                ${cardActionHint ? `<div class="reservation-card-hint">${cardActionHint}</div>` : ''}
                ${workspaceActions}
                <div class="reservation-state ${reservationState}">${reservationStateLabel}</div>
            </div>
        `;
    }

    async deleteReservation(id) {
        if (confirm('Are you sure you want to cancel this reservation?')) {
            try {
                await this.apiRequest(`/reservations/${encodeURIComponent(id)}`, {
                    method: 'DELETE'
                });

                await Promise.all([
                    this.syncReservationsFromApi(),
                    this.refreshSelectedAvailability(false)
                ]);
                this.updateTimeSlotSelection();
                this.updateSelectionSummary();
                this.updateActionState();
            } catch (error) {
                if (this.handleUnauthorized(error)) {
                    return;
                }
                this.showSyncError(`Failed to cancel reservation: ${error.message}`);
            }
        }
    }
}

// Initialize the reservation system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ReservationSystem();
});
