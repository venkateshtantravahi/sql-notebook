import useThemeStore from "./store/useThemeStore.js";
import Header from "./components/layout/Header.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import MainArea from "./components/layout/MainArea.jsx";
import BottomBar from "./components/layout/BottomBar.jsx";
import ConfigModal from "./components/modal/ConfigModal.jsx";

function App() {
    const { theme, toggleTheme } = useThemeStore()
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            <Header />
            <Sidebar />
            <MainArea />
            <BottomBar />
            <ConfigModal />
        </div>
    )
}

export default App
