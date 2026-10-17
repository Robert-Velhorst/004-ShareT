
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const navItems = [
    { name: "Features", href: "#features" },
    { name: "How It Works", href: "#how-it-works" },
    { name: "Pricing", href: "#pricing" },
    { name: "FAQ", href: "#faq" },
  ];

  return (
    <nav className="py-4 px-6 md:px-10 lg:px-20 w-full absolute top-0 left-0 z-50">
      <div className="flex justify-between items-center">
        <Link to="/" className="text-2xl font-bold text-white flex items-center">
          <span className="text-blue-400">Share</span>
          <span className="text-white">T</span>
        </Link>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex space-x-8 items-center">
          {navItems.map((item) => (
            <a 
              key={item.name} 
              href={item.href}
              className="text-gray-300 hover:text-white transition-colors duration-200"
            >
              {item.name}
            </a>
          ))}
          <Link to="/app">
            <Button variant="outline" className="border-blue-400 text-blue-400 hover:bg-blue-400/10">
              Get Started
            </Button>
          </Link>
        </div>
        
        {/* Mobile Menu Button */}
        <button className="md:hidden text-white" onClick={toggleMenu}>
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      
      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 w-full bg-[#161b22] py-4 px-6 space-y-4 shadow-lg animate-fade-in rounded-b-lg border-t border-gray-800">
          {navItems.map((item) => (
            <a 
              key={item.name} 
              href={item.href}
              className="block text-gray-300 hover:text-white transition-colors duration-200 py-2"
              onClick={() => setIsMenuOpen(false)}
            >
              {item.name}
            </a>
          ))}
          <Link to="/app" onClick={() => setIsMenuOpen(false)}>
            <Button variant="outline" className="w-full border-blue-400 text-blue-400 hover:bg-blue-400/10">
              Get Started
            </Button>
          </Link>
        </div>
      )}
    </nav>
  );
};

export default Navigation;
