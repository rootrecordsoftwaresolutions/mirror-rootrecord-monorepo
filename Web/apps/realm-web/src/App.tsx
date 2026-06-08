import { Route, Routes } from "react-router-dom";
import PlayerProfilePage from "./PlayerProfilePage";
import HomePage from "./HomePage";

const API_BASE =
  import.meta.env.VITE_BLOCKNOTES_API_BASE ||
  "https://rootrecord-api-blocknotes.rootrecord.workers.dev";

export { API_BASE };

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/player/:playerId" element={<PlayerProfilePage />} />
    </Routes>
  );
}
