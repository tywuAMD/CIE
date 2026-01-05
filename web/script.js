// Reservation System JavaScript

class ReservationSystem {
    constructor() {
        this.platforms = ['W7900D']; // Available platforms
        this.selectedPlatform = null;
        this.selectedDate = null;
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.reservations = this.loadReservations();
        
        this.init();
    }

    init() {
        this.resetFormInputs();
        this.renderPlatforms();
        this.setupEventListeners();
        this.setDateConstraints();
        this.updateReservationSectionVisibility();
    }

    resetFormInputs() {
        // Reset all form inputs to default on page load
        document.getElementById('dateInput').value = '';
        document.getElementById('startTime').value = '';
        document.getElementById('duration').value = '';
    }

    renderPlatforms() {
        const container = document.getElementById('platformSelector');
        container.innerHTML = '';

        this.platforms.forEach(platform => {
            const card = document.createElement('div');
            card.className = 'platform-card';
            card.innerHTML = `
                <span class="platform-name">${platform}</span>
                <span class="platform-status">Available</span>
            `;
            card.addEventListener('click', () => this.selectPlatform(platform));
            container.appendChild(card);
        });
    }

    selectPlatform(platform) {
        this.selectedPlatform = platform;
        
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
    }

    setupEventListeners() {
        const dateInput = document.getElementById('dateInput');
        const startTimeInput = document.getElementById('startTime');
        const durationInput = document.getElementById('duration');
        const makeReservationBtn = document.getElementById('makeReservationBtn');
        const form = document.getElementById('reservationForm');
        const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
        const closeModal = document.getElementById('closeModal');

        dateInput.addEventListener('change', () => this.handleDateChange());
        startTimeInput.addEventListener('change', () => this.handleSelectionChange());
        durationInput.addEventListener('change', () => this.handleSelectionChange());
        makeReservationBtn.addEventListener('click', () => this.showConfirmationModal());
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        cancelConfirmBtn.addEventListener('click', () => this.closeConfirmationModal());
        closeModal.addEventListener('click', () => this.closeSuccessModal());

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

    handleSelectionChange() {
        this.clearAvailabilityMessage();
        this.updateTimeSlotSelection();
    }

    updateTimeSlotSelection() {
        const startTime = document.getElementById('startTime').value;
        const duration = document.getElementById('duration').value;

        if (!startTime || !duration || !this.selectedPlatform || !this.selectedDate) {
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
        this.renderTimeSlots(affectedHours, hasConflict);
    }

    setDateConstraints() {
        const dateInput = document.getElementById('dateInput');
        const today = new Date();
        
        // Set min date to today
        dateInput.min = this.formatDate(today);
        
        // Don't set a default value - let it show placeholder
        this.selectedDate = null;
    }

    updateReservationSectionVisibility() {
        const reservationSection = document.getElementById('reservationSection');
        
        if (this.selectedPlatform && this.selectedDate) {
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

    timeToMinutes(time) {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }

    handleDateChange() {
        const dateInput = document.getElementById('dateInput');
        this.selectedDate = dateInput.value || null;
        this.clearAvailabilityMessage();
        this.updateReservationSectionVisibility();
    }

    clearAvailabilityMessage() {
        const message = document.getElementById('availabilityMessage');
        message.className = 'availability-message';
        message.innerHTML = '';
    }
    
    clearSelection() {
        document.getElementById('startTime').value = '';
        document.getElementById('duration').value = '';
        this.clearAvailabilityMessage();
        this.updateReservationSectionVisibility();
    }

    showConfirmationModal() {
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
        // Clear form inputs but keep time selection
        document.getElementById('name').value = '';
        document.getElementById('email').value = '';
        document.getElementById('phone').value = '';
        document.getElementById('notes').value = '';
    }

    checkForConflicts(platform, date, startTime, endTime) {
        const startMinutes = this.timeToMinutes(startTime);
        const endMinutes = this.timeToMinutes(endTime);

        return this.reservations.filter(reservation => {
            if (reservation.platform !== platform) return false;
            if (reservation.date !== date) return false;

            const resStartMinutes = this.timeToMinutes(reservation.time);
            const resEndTime = this.addHoursToTime(reservation.time, reservation.duration);
            const resEndMinutes = this.timeToMinutes(resEndTime);

            // Check for overlap
            return (startMinutes < resEndMinutes && endMinutes > resStartMinutes);
        });
    }

    renderTimeSlots(selectedHours = [], hasConflict = false) {
        const container = document.getElementById('timelineContainer');
        
        if (!container) return;
        
        container.innerHTML = '';

        if (!this.selectedPlatform || !this.selectedDate) {
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
            const slot = this.createTimeSlotSquare(hour, isSelected, hasConflict);
            grid.appendChild(slot);
        }
        
        container.appendChild(grid);
    }

    createTimeSlotSquare(hour, isSelected = false, hasConflict = false) {
        const square = document.createElement('div');
        const hourStart = `${String(hour).padStart(2, '0')}:00`;
        const hourEnd = `${String((hour + 1) % 24).padStart(2, '0')}:00`;

        // Get reservations for this platform and date
        const dayReservations = this.reservations.filter(r => 
            r.platform === this.selectedPlatform && r.date === this.selectedDate
        );

        // Find reservations that overlap with this hour
        const hourStartMinutes = hour * 60;
        const hourEndMinutes = (hour + 1) * 60;

        let overlappingReservations = [];
        
        dayReservations.forEach(reservation => {
            const resStartMinutes = this.timeToMinutes(reservation.time);
            const resEndTime = this.addHoursToTime(reservation.time, reservation.duration);
            const resEndMinutes = this.timeToMinutes(resEndTime);

            // Check if this reservation overlaps with current hour
            if (resStartMinutes < hourEndMinutes && resEndMinutes > hourStartMinutes) {
                const overlapStart = Math.max(hourStartMinutes, resStartMinutes);
                const overlapEnd = Math.min(hourEndMinutes, resEndMinutes);
                const overlapMinutes = overlapEnd - overlapStart;
                
                overlappingReservations.push({
                    reservation: reservation,
                    overlapMinutes: overlapMinutes
                });
            }
        });

        // Determine slot status
        let statusClass = 'available';
        let statusText = 'Available';
        let bookingInfo = '';
        let isFullyBooked = false;
        
        if (overlappingReservations.length > 0) {
            const totalOverlap = overlappingReservations.reduce((sum, r) => sum + r.overlapMinutes, 0);
            
            if (totalOverlap >= 60) {
                statusClass = 'booked';
                statusText = 'Reserved';
                bookingInfo = overlappingReservations[0].reservation.name;
                isFullyBooked = true;
            } else {
                statusClass = 'partially-booked';
                statusText = 'Partial';
                bookingInfo = overlappingReservations[0].reservation.name;
            }
        }

        // Add selection highlighting
        if (isSelected) {
            if (hasConflict) {
                statusClass += ' selected-conflict';
                statusText = 'Conflict!';
            } else {
                statusClass += ' selected-available';
                statusText = overlappingReservations.length > 0 ? 'Partial' : 'Your Selection';
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
        if (!isFullyBooked) {
            square.style.cursor = 'pointer';
            square.addEventListener('click', () => this.selectStartTime(hourStart));
        } else {
            square.style.cursor = 'not-allowed';
        }

        // Add tooltip for booked slots
        if (overlappingReservations.length > 0) {
            let tooltipText = '';
            overlappingReservations.forEach(overlap => {
                const res = overlap.reservation;
                const endTime = this.addHoursToTime(res.time, res.duration);
                tooltipText += `${res.name}\n${this.formatTime(res.time)} - ${this.formatTime(endTime)}\n`;
            });
            square.title = tooltipText.trim();
        } else if (isSelected) {
            square.title = hasConflict ? 'This time conflicts with an existing reservation' : 'Your selected time slot';
        } else {
            square.title = 'Click to select this as start time';
        }

        return square;
    }

    selectStartTime(time) {
        // Set the start time input
        document.getElementById('startTime').value = time;
        
        // Set duration to 1 hour by default
        document.getElementById('duration').value = '1';
        
        // Clear availability message
        this.clearAvailabilityMessage();
        
        // Update visualization (will show the selected hour with 1-hour duration)
        this.updateTimeSlotSelection();
        
        // Scroll to the time inputs
        const timeInputs = document.querySelector('.time-duration-selection');
        if (timeInputs) {
            timeInputs.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }


    handleFormSubmit(e) {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const notes = document.getElementById('notes').value.trim();

        const reservation = {
            id: Date.now().toString(),
            platform: this.selectedPlatform,
            date: this.selectedDate,
            time: this.selectedStartTime,
            duration: this.selectedDuration,
            name: name,
            email: email,
            phone: phone,
            notes: notes,
            createdAt: new Date().toISOString()
        };

        this.reservations.push(reservation);
        this.saveReservations();
        
        // Close confirmation modal
        this.closeConfirmationModal();
        
        // Show success modal
        this.showSuccessModal(reservation);
        
        // Reset form and selections
        document.getElementById('reservationForm').reset();
        this.selectedStartTime = null;
        this.selectedDuration = null;
        this.clearSelection();
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
            A confirmation email will be sent to <strong>${reservation.email}</strong>
        `;

        modal.classList.add('show');
    }

    closeSuccessModal() {
        const modal = document.getElementById('successModal');
        modal.classList.remove('show');
    }

    renderReservationsList() {
        const container = document.getElementById('reservationsList');
        
        if (this.reservations.length === 0) {
            container.innerHTML = '<p class="empty-state">No reservations yet</p>';
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
            const deleteBtn = document.getElementById(`delete-${reservation.id}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => this.deleteReservation(reservation.id));
            }
        });
    }

    createReservationCard(reservation) {
        const endTime = this.addHoursToTime(reservation.time, reservation.duration);
        return `
            <div class="reservation-card">
                <button class="delete-btn" id="delete-${reservation.id}" title="Cancel reservation">×</button>
                <div class="date">🖥️ ${reservation.platform}</div>
                <div class="date">${this.formatDateDisplay(reservation.date)}</div>
                <div class="time">⏰ ${this.formatTime(reservation.time)} - ${this.formatTime(endTime)}</div>
                <div class="time">⏳ ${reservation.duration} hour${reservation.duration > 1 ? 's' : ''}</div>
                <div class="name">👤 ${reservation.name}</div>
            </div>
        `;
    }

    deleteReservation(id) {
        if (confirm('Are you sure you want to cancel this reservation?')) {
            this.reservations = this.reservations.filter(r => r.id !== id);
            this.saveReservations();
            this.updateTimeSlotSelection();
        }
    }

    loadReservations() {
        try {
            const stored = localStorage.getItem('reservations');
            const reservations = stored ? JSON.parse(stored) : [];
            
            // Add default platform for backward compatibility with old reservations
            return reservations.map(res => ({
                ...res,
                platform: res.platform || 'W7900D'
            }));
        } catch (error) {
            console.error('Error loading reservations:', error);
            return [];
        }
    }

    saveReservations() {
        try {
            localStorage.setItem('reservations', JSON.stringify(this.reservations));
        } catch (error) {
            console.error('Error saving reservations:', error);
        }
    }
}

// Initialize the reservation system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ReservationSystem();
});
