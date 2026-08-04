import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { WelcomeScreen } from './components/WelcomeScreen'
import { ListenerSpace } from './components/ListenerSpace'
import { ArtistSpace } from './components/ArtistSpace'
import { AdminZone } from './components/AdminZone'
import { RulesPage } from './components/RulesPage'
import { NotFoundPage } from './components/NotFoundPage'
import { Notifications, CollabChat } from './components/Notifications'

function HomeShell() {
  const { role } = useApp()

  if (role === 'listener') return <ListenerSpace />
  if (role === 'artist') return <ArtistSpace />
  return <WelcomeScreen />
}

function AppRoutes() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<HomeShell />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/admin-zone" element={<AdminZone />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Notifications />
      <CollabChat />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  )
}
