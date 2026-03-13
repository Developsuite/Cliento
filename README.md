<<<<<<< HEAD
# SalesForge CRM - Complete Business Management Platform

A modern, full-stack CRM application built with React frontend and Node.js backend, featuring client management, project tracking, meeting scheduling, and **secure user authentication**.

## ✨ Features

### 🔐 User Authentication
- **Secure Signup & Login**: User registration and authentication system
- **JWT Tokens**: Secure session management with 7-day expiration
- **Password Security**: Bcrypt hashing with strength validation
- **Protected Routes**: Dashboard access only after authentication
- **Persistent Sessions**: Automatic login state management

### 🏢 Client Management
- Add, edit, and delete clients
- Track business information and contact details
- Manage pitch status and follow-up dates
- Export client data to Excel

### 📋 Project Management
- Create and manage projects linked to clients
- Track project status, priority, and progress
- **NEW: File upload support for project documents**
- **NEW: Detailed project view with document management**
- Support for multiple file types (PDF, Word, Excel, Images)

### 📅 Meeting Scheduling
- Schedule meetings with clients
- Track meeting notes and outcomes
- Calendar integration

### 📊 Dashboard
- Real-time statistics and analytics
- Visual charts and progress tracking
- Quick overview of all activities

## 🚀 New Features (Latest Update)

### 🔐 Authentication System
- **Complete Auth Flow**: Signup, login, and protected dashboard access
- **Modern UI Design**: Beautiful authentication pages with custom background support
- **Responsive Layout**: Split-screen design with forms and background image
- **Theme Consistency**: Matches the overall project design aesthetic

### 📁 Document Management
- **File Upload**: Attach multiple documents to projects during creation
- **File Types Supported**: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), Text files, Images (JPG, PNG, GIF)
- **File Size Limit**: 10MB per file
- **Storage**: Files are stored securely on the server with unique naming

### 👁️ Project Detail View
- **Show Button**: New eye icon button on project cards to view full details
- **Comprehensive View**: See all project information, dates, and assigned team members
- **Document Browser**: View, download, and delete attached documents
- **Add More Files**: Upload additional documents to existing projects
- **Real-time Updates**: Changes reflect immediately in the interface

## 🛠️ Technology Stack

### Frontend
- React 18 with modern hooks
- Tailwind CSS for styling
- Shadcn/ui components
- Lucide React icons
- Chart.js for data visualization

### Backend
- Node.js with Express
- MongoDB with Mongoose
- Multer for file uploads
- Express validation
- CORS enabled

## 📦 Installation

### Prerequisites
- Node.js 16+ 
- MongoDB database
- npm or yarn

### Authentication Setup
The authentication system is automatically configured. Users can:
1. **Sign up** with email and password
2. **Login** to access the dashboard
3. **Stay logged in** with persistent sessions
4. **Logout** to end their session

For custom background images, see `frontend/README-AUTH.md`

### Backend Setup
```bash
cd backend
npm install
# Create .env file with your MongoDB URI
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

## 🔧 Environment Variables

Create a `.env` file in the backend directory:

```env
MONGODB_URI=your_mongodb_connection_string
PORT=5000
CORS_ORIGIN=http://localhost:3000
```

## 📁 File Storage

- Uploaded files are stored in `backend/uploads/projects/`
- Files are served statically at `/uploads` endpoint
- Automatic directory creation
- Secure file naming with timestamps

## 🎨 UI/UX Features

- **Glass Morphism**: Modern, translucent design elements
- **Gradient Backgrounds**: Beautiful color transitions
- **Responsive Design**: Works on all device sizes
- **Smooth Animations**: Hover effects and transitions
- **Dark Theme**: Easy on the eyes with high contrast

## 🔒 Security Features

- File type validation
- File size limits
- Secure file storage
- Input validation and sanitization
- CORS protection

## 📱 Usage

1. **Add Clients**: Navigate to Clients tab and click "Add Client"
2. **Create Projects**: Go to Projects tab and click "Add Project"
3. **Upload Files**: Use the file upload area in project forms
4. **View Details**: Click the eye icon on project cards
5. **Manage Documents**: View, download, or delete files in project detail view

## 🚧 Development

The application is built with modern development practices:
- Component-based architecture
- State management with React hooks
- RESTful API design
- Error handling and user feedback
- Responsive and accessible design

## 📄 License

MIT License - feel free to use and modify as needed.
=======
# Cliento
Cliento is a client managemnet system specailly for various comapnies to manage their client mangemnt syytem in ease 
>>>>>>> 206bd8c48589c30fd8990a5ae9ee71905680a062
