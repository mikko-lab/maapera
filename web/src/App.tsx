import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MapRoute from './routes/MapRoute'
import Privacy from './routes/Privacy'
import Terms from './routes/Terms'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapRoute />} />
        <Route path="/tietosuoja" element={<Privacy />} />
        <Route path="/kayttoehdot" element={<Terms />} />
      </Routes>
    </BrowserRouter>
  )
}
