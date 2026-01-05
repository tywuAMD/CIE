# Time Slot Reservation System

A beautiful, modern web application for making reservations for different time slots.

## Features

✨ **Modern UI/UX**
- Clean, responsive design that works on all devices
- Smooth animations and transitions
- Intuitive user interface

📅 **Date Selection**
- Interactive date picker
- Cannot select past dates
- Defaults to tomorrow's date

⏰ **Time Slot Management**
- 12 available time slots per day (9 AM - 8 PM)
- Visual indication of available vs. booked slots
- Click to select available time slots

📝 **Reservation Form**
- User information collection (name, email, phone, notes)
- Form validation
- Confirmation modal after successful booking

💾 **Data Persistence**
- Reservations stored in browser's local storage
- View all your reservations in the sidebar
- Cancel reservations with a single click

## How to Use

1. **Open the Application**
   - Simply open `index.html` in your web browser
   - No server or installation required!

2. **Select a Date**
   - Use the date picker to choose your desired date
   - Only future dates can be selected

3. **Choose a Time Slot**
   - Browse available time slots
   - Green slots are available, gray slots are already booked
   - Click on an available slot to select it

4. **Fill in Your Information**
   - Enter your name and email (required)
   - Optionally add phone number and notes
   - Click "Confirm Reservation"

5. **View Your Reservations**
   - All your reservations appear in the right sidebar
   - Click the × button to cancel a reservation

## File Structure

```
CIE/
├── index.html      # Main HTML structure
├── styles.css      # Styling and layout
├── script.js       # JavaScript functionality
└── README.md       # This file
```

## Technical Details

- **Pure HTML, CSS, and JavaScript** - No frameworks or libraries required
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Local Storage** - Data persists across browser sessions
- **Modern ES6+ JavaScript** - Clean, maintainable code with classes

## Browser Compatibility

Works on all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

## Customization

You can easily customize the application by modifying:

- **Time Slots**: Edit the `timeSlots` array in `script.js`
- **Colors**: Modify CSS variables in `:root` section of `styles.css`
- **Form Fields**: Add or remove fields in `index.html` and update `script.js`

## Future Enhancements

Potential features to add:
- Backend integration for multi-user support
- Email notifications
- Different reservation durations
- Admin panel for managing reservations
- Export reservations to calendar
- Payment integration

---

Enjoy your reservation system! 🎉

