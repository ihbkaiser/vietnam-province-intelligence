import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { ProvinceDetailPage } from './pages/ProvinceDetailPage';
import { ResolverPage } from './pages/ResolverPage';
import ChatBox from './components/ChatBox';

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/province/:provinceCode" element={<ProvinceDetailPage />} />
          <Route path="/resolver" element={<ResolverPage />} />
        </Route>
      </Routes>
      
      <ChatBox />
    </>
  );
}
