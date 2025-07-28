import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRefresh } from '../context/RefreshContext';
import axios from 'axios';

function Payment() {
  const location = useLocation();
  const navigate = useNavigate();
  const { triggerRefresh } = useRefresh();
  const { project } = location.state || {};
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use VITE_BACKEND_URL from environment variables for all backend calls
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

  const handlePaymentSuccess = async (response) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      // --- Added token check ---
      if (!token) {
        throw new Error('User not authenticated. Please log in.');
      }
      // ------------------------

      console.log('Payment Success Response:', response);
      console.log('Project Data:', project);

      if (!response.razorpay_payment_id || !response.razorpay_order_id) {
        throw new Error('Missing payment details from Razorpay');
      }

      if (!project._id || !project.amount) {
        throw new Error('Missing project details');
      }

      // Record the payment in our database
      const paymentData = {
        projectId: project._id,
        amount: Number(project.amount),
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id
      };

      console.log('Sending payment data to:', `${BACKEND_URL}/api/payments/create`);
      console.log('Payment data:', paymentData);
      console.log('Token for /api/payments/create:', token ? 'Present' : 'Missing'); // Debugging token presence

      const paymentResponse = await axios.post(
        `${BACKEND_URL}/api/payments/create`, // Using BACKEND_URL
        paymentData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('Payment record response:', paymentResponse.data);

      if (!paymentResponse.data.payment) {
        throw new Error('Payment record not created properly');
      }

      // Update project funds
      console.log('Sending fund update to:', `${BACKEND_URL}/update-funds`);
      console.log('Fund update data: Project ID', project._id, 'Amount:', project.amount);
      console.log('Token for /update-funds:', token ? 'Present' : 'Missing'); // Debugging token presence

      // --- CRUCIAL FIX: Added Authorization header to update-funds call ---
      const fundUpdateResponse = await axios.post(
        `${BACKEND_URL}/update-funds`, // Using BACKEND_URL
        {
          projectId: project._id,
          amount: Number(project.amount)
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`, // <--- THIS WAS ADDED/CORRECTED
            'Content-Type': 'application/json'
          }
        }
      );
      // ------------------------------------------------------------------

      console.log('Fund update response:', fundUpdateResponse.data);

      if (!fundUpdateResponse.data.success) {
        console.warn('Fund update might have failed:', fundUpdateResponse.data);
      }

      triggerRefresh();

      // Show success message and redirect
      alert('Payment successful! Thank you for your contribution.');
      navigate(`/project-details/${project._id}`);
    } catch (error) {
      console.error('Payment recording failed:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        project: project,
        razorpayResponse: response,
        // Optional: Include token for debugging if not sensitive for your logs
        // tokenDebug: localStorage.getItem('token')
      });

      setError(
        error.response?.data?.message ||
        error.message ||
        'Failed to record payment. Please contact support with payment ID: ' +
        (response?.razorpay_payment_id || 'UNKNOWN')
      );
    } finally {
      setLoading(false);
    }
  };

  const displayRazorpay = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Razorpay Key ID:', import.meta.env.VITE_RAZORPAY_KEY_ID); // Prints fine
      console.log('Project amount:', project.amount); // Ensure this prints a valid number

      if (!project.amount || Number(project.amount) <= 0) {
        throw new Error('Invalid payment amount');
      }

      const response = await axios.post(`${BACKEND_URL}/create-order`, {
        amount: Number(project.amount)
      });

      console.log('Order creation response from backend:', response.data); // This should print

      if (!response.data.order || !response.data.order.id) {
        throw new Error('Failed to create payment order');
      }

      // --- ADD THIS NEW LOG LINE ---
      console.log('*** Execution Reached: After successful order creation check. ***');
      // -----------------------------

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Or "rzp_test_vucqcBUbDGj0LU" with quotes
        amount: response.data.order.amount,
        currency: "INR",
        name: "CrowdFund",
        description: `Payment for ${project.name}`,
        order_id: response.data.order.id,
        handler: handlePaymentSuccess,
        prefill: {
          name: "User Name",
          email: "user@example.com",
        },
        theme: {
          color: "#3B82F6"
        },
        modal: {
          ondismiss: function() {
            setLoading(false);
            console.log('Payment modal dismissed');
          }
        }
      };

      // These logs should print if the above "Reached" log prints
      console.log('Full options object being passed to Razorpay:', options);
      console.log('Value of options.key:', options.key);

      // Ensure Razorpay SDK is loaded
      if (typeof window.Razorpay === 'undefined') {
        console.error('Razorpay SDK is not loaded. Ensure the script is in index.html.');
        setError('Payment gateway not ready. Please try again or refresh the page.');
        setLoading(false);
        return;
      }

      const razorpayWindow = new window.Razorpay(options);
      razorpayWindow.open();

    } catch (error) {
      console.error('Error initiating payment:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        project: project
      });

      setError(
        error.response?.data?.message ||
        error.message ||
        'Failed to initiate payment. Please try again.'
      );
      setLoading(false);
    }
  };
  if (!project) {
    return <div className="text-center py-10">No project details found</div>;
  }

  return (
    <div className="max-w-2xl mx-auto mt-24 p-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-4">Payment Details</h2>
        <div className="mb-4">
          <p className="text-lg">Project: {project.name}</p>
          <p className="text-xl font-semibold">Amount: ₹{project.amount}</p>
        </div>
        {error && (
          <div className="text-red-500 mb-4 p-3 bg-red-50 rounded-lg">
            {error}
          </div>
        )}
        <button
          onClick={displayRazorpay}
          disabled={loading}
          className={`w-full bg-blue-600 text-white py-3 rounded-lg ${
            loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
          } transition-colors`}
        >
          {loading ? 'Processing...' : 'Proceed to Pay'}
        </button>
      </div>
    </div>
  );
}

export default Payment;