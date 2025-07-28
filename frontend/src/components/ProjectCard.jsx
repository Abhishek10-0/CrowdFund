import { useNavigate } from "react-router-dom";
import { FaUsers, FaClock, FaTag } from "react-icons/fa";
import { motion } from "framer-motion";
import axios from 'axios';
import { useState } from 'react';

const BASE_URL = "http://localhost:5001"; // Backend URL to access images

const ProjectCard = ({ project, isCompact = false }) => {
  const navigate = useNavigate();
  const [showAmountInput, setShowAmountInput] = useState(false);
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');

  if (!project) {
    return <p>Loading...</p>;
  }

  const handleCardClick = () => {
    navigate(`/project-details/${project._id}`);
  };

  const handleAmountSubmit = async (e) => {
console.log('Razorpay Key ID:', import.meta.env.VITE_RAZORPAY_KEY_ID);
    e.stopPropagation(); // Prevent card click
    
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    
    if (!amount || Number(amount) <= 0) {
      setAmountError('Please enter a valid amount');
      return;
    }

    if (Number(amount) > 1000000) {
      setAmountError('Amount cannot exceed ₹10,00,000');
      return;
    }

    try {
      const response = await axios.post("http://localhost:5001/create-order", {
        amount: Number(amount),
      });
  
      const { order } = response.data;
  
      const options = {
        amount: order.amount,
        currency: order.currency,
        name: project.name,
        description: `Support the project: ${project.name}`,
        order_id: order.id,
        handler: async function (response) {
          alert(`Payment successful! Payment ID: ${response.razorpay_payment_id}`);
  
          await axios.post("http://localhost:5001/update-funds", {
            projectId: project._id,
            amount: Number(amount),
          });
  
          project.raised += Number(amount);
          setShowAmountInput(false);
          setAmount('');
        },
        prefill: {
          name: "",
          email: "",
          contact: "",
        },
        theme: {
          color: "#3399cc",
        },
        modal: {
          escape: false,
          confirm_close: true,
          ondismiss: function() {
            setShowAmountInput(false);
            setAmount('');
          }
        }
      };
  
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error("Payment failed:", error);
      setAmountError('Payment initiation failed. Please try again.');
    }
  };

  const handleAmountChange = (e) => {
    const value = e.target.value;
    if (value === '' || (/^\d+$/.test(value) && Number(value) <= 1000000)) {
      setAmount(value);
      setAmountError('');
    }
  };

  const handleFundClick = (e) => {
    e.stopPropagation();
    const token = localStorage.getItem('token');
    
    if (!token) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    
    setShowAmountInput(true);
  };
  
  const progressWidth = project.target && project.raised
    ? Math.min((Number(project.raised) / Number(project.target)) * 100, 100)
    : 0;

  const imageUrl = project.image
    ? `${BASE_URL}${project.image}` 
    : "/images/fallback-image.png";

  // Truncate description to 2 lines (approximately 120 characters)
  const truncateDescription = (text) => {
    if (!text) return "";
    return text.length > 120 ? text.substring(0, 120) + "..." : text;
  };

  return (
    <motion.div
      whileHover={{ scale: 1.03, boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.2)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gray-200 shadow-lg rounded-lg p-4 w-full sm:max-w-sm md:max-w-md min-h-[400px] sm:min-h-[450px] cursor-pointer"
      // onClick={handleCardClick} // Navigate to project details on click
    >
      {/* Image Section - Fixed Height */}
      <div className="h-48">
        <img
          src={imageUrl}
          alt={project.name}
          className="w-full h-full object-cover rounded-lg"
          onError={(e) => (e.target.src = "/images/fallback-image.png")}
        />
      </div>

      {/* Category */}
      <div className="mt-3 flex items-center gap-2 text-gray-700 text-xs">
        <FaTag className="text-gray-500" />
        <span>{project.category}</span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold mt-2 text-gray-900">{project.name}</h3>

      {/* Description - Fixed Height */}
      {!isCompact && (
        <div className="mt-2 h-12"> {/* Fixed height for 2 lines */}
          <p className="text-gray-600 text-sm line-clamp-2">
            {truncateDescription(project.description)}
          </p>
        </div>
      )}

      {/* Progress Section */}
      <div className="mt-auto w-full"> {/* Push to bottom */}
        <div className="w-full bg-gray-300 rounded-full h-2">
          <motion.div
            className="bg-blue-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressWidth}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Stats */}
        <div className="text-sm text-gray-700 mt-2">
          <p className="flex justify-between">
            <span>Raised: ₹{project.raised ? Number(project.raised).toLocaleString('en-IN') : "0"}</span>
            <span className="text-blue-500 font-medium">{progressWidth.toFixed(1)}% funded</span>
          </p>
          <p className="text-gray-500">
            Goal: ₹{project.target ? Number(project.target).toLocaleString('en-IN') : "N/A"}
          </p>
        </div>

      <div className="flex justify-between text-gray-700 mt-3 text-xs sm:text-sm">
        <span className="flex items-center gap-1">
          <FaUsers className="text-blue-500" /> {project.investors} investors
        </span>
        <span className="flex items-center gap-1">
          <FaClock className="text-blue-500" /> {project.daysLeft} days left
        </span>
      </div>

        {/* Fund Button and Amount Input */}
        <div className="mt-4">
          {showAmountInput ? (
            <div onClick={(e) => e.stopPropagation()} className="space-y-2">
              <input
                type="number"
                value={amount}
                onChange={handleAmountChange}
                placeholder="Enter amount in ₹"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
                max="1000000"
              />
              {amountError && (
                <p className="text-red-500 text-xs">{amountError}</p>
              )}
              <div className="flex gap-2">
                <button
                  className="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition duration-300"
                  onClick={handleAmountSubmit}
                >
                  Proceed
                </button>
                <button
                  className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition duration-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAmountInput(false);
                    setAmount('');
                    setAmountError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition duration-300"
              onClick={handleFundClick}
            >
              Fund Now
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ProjectCard;