import { AppProvider, useApp } from './context/AppContext'
import { WelcomeScreen } from './components/WelcomeScreen'
import { ListenerSpace } from './components/ListenerSpace'
import { ArtistSpace } from './components/ArtistSpace'
import { Notifications, CollabChat } from './components/Notifications'

function Shell() {
  const { role } = useApp()

  return (
    <div className="app">
      {role === null && <WelcomeScreen />}
      {role === 'listener' && <ListenerSpace />}
      {role === 'artist' && <ArtistSpace />}
      <Notifications />
      <CollabChat />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
