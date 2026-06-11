# GK Manufacturing Integrated System

A comprehensive React Native application for managing manufacturing processes, inventory, and quality control for GK Manufacturing.

## Features

- **Role-based Access Control**: Admin, Storekeeper, PTC Manager, Quality Inspector, Final Quality Inspector
- **Dashboard**: Real-time metrics with cards showing key quantities
- **Inventory Management**: Raw material tracking and monthly schedule management
- **Work Order Management**: Create and manage production work orders
- **Quality Inspection**: In-process and final quality control
- **Reports**: Production and quality metrics
- **Configuration**: System setup and user management

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on platform:
```bash
npm run android  # for Android
npm run ios      # for iOS
npm run web      # for Web
```


## Architecture

- **Frontend**: React Native with Expo
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Navigation**: React Navigation with Drawer Navigator
- **Storage**: AsyncStorage for client-side data persistence
- **State Management**: React hooks with local state

## Project Structure

```
src/
├── navigation/
│   └── DrawerNavigator.tsx
├── screens/
│   ├── LoginScreen.tsx
│   ├── DashboardScreen.tsx
│   ├── ConfigurationScreen.tsx
│   ├── InventoryScreen.tsx
│   ├── WorkOrderScreen.tsx
│   ├── QualityScreen.tsx
│   └── ReportsScreen.tsx
├── types/
│   └── index.ts
└── utils/
    └── storage.ts
```

## Key Components

- **LoginScreen**: Authentication with role-based access
- **DashboardScreen**: Cards displaying total raw materials, work orders, inspections, and scrap
- **InventoryScreen**: Manage raw materials and monthly schedules
- **WorkOrderScreen**: Create and track work orders with status management
- **QualityScreen**: Record quality inspections with classification
- **ReportsScreen**: View production summaries and metrics
- **ConfigurationScreen**: Admin-only user and system configuration

## Data Models

- **User**: Authentication and role management
- **RawMaterial**: Inventory tracking
- **MonthlySchedule**: Production planning
- **WorkOrder**: Production tasks
- **ProcessStage**: Manufacturing stages
- **QualityInspection**: Quality control records

## Future Enhancements

- IoT integration for real-time machine data
- Advanced dashboard with charts
- QR code tracking
- Mobile app optimization
- ERP integrations