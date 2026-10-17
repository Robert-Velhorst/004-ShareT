
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";

const PricingTier = ({ name, price, description, features, isPopular, cta }) => {
  const navigate = useNavigate();
  
  return (
    <div className={`bg-[#161b22] rounded-xl p-8 flex flex-col h-full border ${isPopular ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-gray-800'}`}>
      {isPopular && (
        <div className="bg-blue-500 text-white py-1 px-4 rounded-full text-sm font-medium self-start mb-4">
          Most Popular
        </div>
      )}
      
      <h3 className="text-2xl font-bold mb-2">{name}</h3>
      <div className="mb-4">
        <span className="text-4xl font-bold">${price}</span>
        {price > 0 && <span className="text-gray-400 ml-1">/month</span>}
      </div>
      
      <p className="text-gray-400 mb-6">{description}</p>
      
      <ul className="space-y-3 mb-8 flex-grow">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <Check className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      
      <Button 
        onClick={() => navigate("/app")} 
        variant={isPopular ? "default" : "outline"} 
        className={`w-full ${isPopular ? 'bg-blue-500 hover:bg-blue-600' : 'border-blue-500 text-blue-500 hover:bg-blue-500/10'}`}
      >
        {cta}
      </Button>
    </div>
  );
};

const Pricing = () => {
  const tiers = [
    {
      name: "Free",
      price: 0,
      description: "Perfect for trying out ShareT",
      features: [
        "3 free shared links",
        "Basic security features",
        "7-day link expiration",
        "Email support"
      ],
      isPopular: false,
      cta: "Get Started"
    },
    {
      name: "Pro",
      price: 9,
      description: "For professionals and small teams",
      features: [
        "Unlimited shared links",
        "Password protection",
        "Custom expiration dates",
        "QR code generation",
        "Analytics dashboard",
        "Priority support"
      ],
      isPopular: true,
      cta: "Start Free Trial"
    },
    {
      name: "Team",
      price: 29,
      description: "For growing teams and agencies",
      features: [
        "Everything in Pro",
        "5 team members",
        "Team management",
        "Custom branding",
        "Advanced analytics",
        "API access",
        "Dedicated support"
      ],
      isPopular: false,
      cta: "Contact Sales"
    }
  ];

  return (
    <section id="pricing" className="py-24 bg-[#0d1117]">
      <div className="max-w-6xl mx-auto px-6 md:px-10">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-6">Simple, Transparent Pricing</h2>
        <p className="text-xl text-gray-400 text-center max-w-3xl mx-auto mb-16">
          Choose the plan that's right for you and start sharing securely
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {tiers.map((tier, index) => (
            <PricingTier key={index} {...tier} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
