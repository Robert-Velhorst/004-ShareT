
import { Link } from "react-router";
import { Github, Twitter, Linkedin, Facebook } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-[#0a0d14] text-gray-400 py-12 px-6 md:px-10 lg:px-20">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-10">
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white flex items-center">
            <span className="text-blue-400">Share</span>
            <span className="text-white">T</span>
          </h3>
          <p className="text-sm">
            The simplest way to share your Trello cards with external collaborators.
          </p>
          <div className="flex space-x-4">
            <a href="https://github.com" className="hover:text-white transition-colors">
              <Github size={20} />
            </a>
            <a href="https://twitter.com" className="hover:text-white transition-colors">
              <Twitter size={20} />
            </a>
            <a href="https://linkedin.com" className="hover:text-white transition-colors">
              <Linkedin size={20} />
            </a>
            <a href="https://facebook.com" className="hover:text-white transition-colors">
              <Facebook size={20} />
            </a>
          </div>
        </div>
        
        <div>
          <h4 className="font-semibold text-white mb-4">Product</h4>
          <ul className="space-y-2">
            <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
            <li><a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a></li>
            <li><a href="#pricing" className="hover:text-white transition-colors">Pricing</a></li>
            <li><a href="#faq" className="hover:text-white transition-colors">FAQ</a></li>
          </ul>
        </div>
        
        <div>
          <h4 className="font-semibold text-white mb-4">Resources</h4>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
            <li><a href="#" className="hover:text-white transition-colors">API</a></li>
          </ul>
        </div>
        
        <div>
          <h4 className="font-semibold text-white mb-4">Legal</h4>
          <ul className="space-y-2">
            <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Cookie Policy</a></li>
            <li><a href="#" className="hover:text-white transition-colors">GDPR</a></li>
          </ul>
        </div>
      </div>
      
      <div className="mt-12 pt-8 border-t border-gray-800 text-center text-sm">
        <p>&copy; {currentYear} ShareT. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
