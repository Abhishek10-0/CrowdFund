import Razorpay from 'razorpay';
import { ApiError } from '../utils/ApiError.js'; // Assuming you have an ApiError utility
import { ApiResponse } from '../utils/ApiResponse.js'; // Assuming you have an ApiResponse utility
import { asyncHandler } from '../utils/asyncHandler.js'; // Assuming you have an asyncHandler utility
import { User } from '../models/user.model.js'; // Assuming your User model
import  Booking  from '../models/booking.model.js'; // Assuming your Booking model

// Initialize Razorpay instance
const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,     // Your Razorpay Key ID
  key_secret: process.env.RAZORPAY_KEY_SECRET, // Your Razorpay Key Secret
});

// Controller to create a Razorpay order
const createOrder = asyncHandler(async (req, res) => {
  const { amount, currency, receipt, notes } = req.body; // amount in paisa

  if (!amount || amount <= 0) {
    throw new ApiError(400, "Amount is required and must be greater than 0.");
  }

  const options = {
    amount: amount, // amount in the smallest currency unit (paisa)
    currency: currency || "INR",
    receipt: receipt || `receipt_${Date.now()}`,
    notes: notes || {} // Optional notes
  };

  try {
    const order = await instance.orders.create(options);
    return res.status(201).json(
      new ApiResponse(201, { orderId: order.id, amount: order.amount, currency: order.currency }, "Order created successfully.")
    );
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    throw new ApiError(500, "Failed to create Razorpay order.");
  }
});

// Controller to verify payment and create booking
const verifyAndBook = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingData } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bookingData) {
    throw new ApiError(400, "Missing payment verification details or booking data.");
  }

  // Verify the payment signature
  const crypto = await import('crypto'); // Dynamically import crypto module
  const shasum = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  shasum.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const digest = shasum.digest('hex');

  if (digest !== razorpay_signature) {
    throw new ApiError(400, "Payment signature verification failed.");
  }

  // --- Payment Verified ---
  // Now, proceed to create the booking in your database
  try {
    // Add payment details to bookingData
    const finalBookingData = {
      ...bookingData,
      paymentStatus: 'Paid', // Mark as paid
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      // You might want to store user ID here if not already in bookingData
      user: req.user?._id || 'DEFAULT_USER_ID_IF_NOT_AUTH', // Assuming user is authenticated via middleware
      // Ensure Date objects are correctly handled for MongoDB
      checkIn: new Date(bookingData.checkIn),
      checkOut: new Date(bookingData.checkOut),
    };

    const newBooking = await Booking.create(finalBookingData);

    if (!newBooking) {
      throw new ApiError(500, "Booking creation failed after payment verification.");
    }

    return res.status(200).json(
      new ApiResponse(200, { bookingId: newBooking._id, paymentStatus: 'verified', bookingDetails: newBooking }, "Payment verified and booking created successfully.")
    );

  } catch (error) {
    console.error("Error creating booking after payment verification:", error);
    // Important: If booking creation fails, you might need a refund mechanism or manual intervention
    throw new ApiError(500, "Failed to create booking after payment verification.");
  }
});

export { createOrder, verifyAndBook };







import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
// import { toast } from 'react-toastify'; // Uncomment if you use react-toastify for toasts
import { useSelector } from 'react-redux'; // Import useSelector to get user info

const PaymentPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { bookingData } = location.state || {}; // Get bookingData passed from BookingComponent

  // --- CHANGED: Directly destructure user properties from authState ---
  // This line fetches the entire 'auth' slice from your Redux store
  const { firstName, lastName, email, userPhone,userId } = useSelector((state) => state.auth);

  // Now, 'user' object is implicitly formed by these individual properties,
  // or you can create a 'user' object if other parts of your code expect it.
  // For prefill, we will use firstName, lastName, email, userPhone directly.
  const user = { firstName, lastName, email, userPhone, userId}; // Create a user object for consistency if needed elsewhere

  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Debug: Log the bookingData and user object received on this page
  useEffect(() => {
    console.log("PaymentPage: Received bookingData:", bookingData);
    if (bookingData && bookingData.totalAmount) {
      console.log("PaymentPage: Amount to be paid (in paisa):", bookingData.totalAmount);
      console.log("PaymentPage: Amount to be paid (in INR):", (bookingData.totalAmount / 100).toFixed(2));
    }
    // Debug: Log the individual properties and the constructed user object
    console.log("PaymentPage: Destructured User Properties:", { firstName, lastName, email, userPhone, userId });
    console.log("PaymentPage: Constructed User Object (for reference):", user);
  }, [bookingData, firstName, lastName, email, userPhone, userId]); // Add all relevant dependencies


  // Load Razorpay SDK dynamically
  useEffect(() => {
    const loadRazorpayScript = () => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        console.log('Razorpay SDK loaded successfully!');
        setRazorpayLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load Razorpay SDK!');
        // toast.error('Failed to load payment gateway. Please try again.'); // Uncomment if you have toast
        setPaymentStatus('Failed to load payment gateway.');
      };
      document.body.appendChild(script);
    };

    if (!window.Razorpay) { // Only load if not already loaded
      loadRazorpayScript();
    } else {
      setRazorpayLoaded(true);
    }

    // Redirect if no booking data is found
    if (!bookingData) {
      // toast.error("Missing booking details. Please try again."); // Uncomment if you have toast
      console.log('No booking data received. Redirecting back to home.');
      navigate('/'); // Redirect to home or booking page if no data
    }
  }, [bookingData, navigate]); // Add navigate to dependencies

  // Function to create an order on your backend
  const createRazorpayOrder = async () => {
    setLoading(true);
    setPaymentStatus('Creating payment order...');
    try {
      // Backend API call to create a Razorpay order
      // IMPORTANT: Verify your axios base URL or proxy setup.
      // If your backend routes are /api/v1/..., use '/api/v1/payments/create-order'.
      // If your backend routes are /v1/..., use '/v1/payments/create-order'.
      const response = await axios.post('/v1/payments/create-order', { // Changed to /api/v1 for standard practice
        amount: bookingData.totalAmount, // Amount in paisa from bookingData
        currency: 'INR',
        receipt: `receipt_${Date.now()}`, // Unique receipt ID
        notes: {
          villaId: bookingData.villa,
          userId: userId // Use _id directly from destructured authState
        }
      });

      // Corrected: Assuming backend sends data nested under a 'data' key
      const { orderId, amount, currency } = response.data.data; // Corrected destructuring
      setLoading(false);
      setPaymentStatus('Order created. Ready to pay.');
      return { orderId, amount, currency };
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      // toast.error('Failed to create payment order.'); // Uncomment if you have toast
      setLoading(false);
      setPaymentStatus('Failed to create payment order.');
      return null;
    }
  };

  // Function to open the Razorpay payment modal
  const handleRazorpayPayment = async () => {
    if (!razorpayLoaded) {
      // toast.error('Payment gateway not loaded yet. Please wait.'); // Uncomment if you have toast
      console.log('Razorpay SDK not loaded.');
      return;
    }

    // Re-added: Validation for booking amount
    if (!bookingData || !bookingData.totalAmount || bookingData.totalAmount <= 0) {
        // toast.error('Invalid booking amount. Please go back and try again.');
        console.error('Invalid booking amount:', bookingData?.totalAmount);
        setPaymentStatus('Invalid booking amount.');
        return;
    }

    const orderDetails = await createRazorpayOrder();
    if (!orderDetails) {
      return; // If order creation failed, stop
    }

    const { orderId, amount, currency } = orderDetails;

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Replace with your actual Razorpay Key ID (rzp_test_...)
      amount: amount, // Amount in paisa (from backend order creation)
      currency: currency,
      name: 'StayAtlas', // Your business name
      description: 'Booking Payment for Villa', // Payment description
      order_id: orderId, // Order ID from your backend

      handler: async function (response) {
        // This function is called when the payment is successful
        setPaymentStatus('Payment successful! Verifying booking...');
        console.log('Razorpay Payment Response:', response);

        try {
          // Send payment response AND bookingData to your backend for verification and booking creation
          const verificationResponse = await axios.post('/v1/payments/verify-and-book', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            bookingData: bookingData, // Pass the original booking data
            // You might also send your own orderId from the backend here if needed
            // my_order_id: orderId,
          });

          if (verificationResponse.data.success) {
            setPaymentStatus('Booking confirmed and payment verified successfully!');
            // toast.success('Booking confirmed!'); // Uncomment if you have toast
            console.log('Booking Confirmed & Payment Verified:', verificationResponse.data);
            // Redirect to profile or booking details page after successful booking
            navigate('/profile', { state: { bookingId: verificationResponse.data.data.bookingId } }); // Pass booking ID if needed
          } else {
            setPaymentStatus('Payment verification failed! Booking not confirmed.');
            // toast.error('Payment verification failed!'); // Uncomment if you have toast
            console.error('Payment Verification Failed:', verificationResponse.data);
            // Optionally, redirect to a failure page or show specific error
          }
        } catch (error) {
          setPaymentStatus('Error during payment verification or booking creation.');
          // toast.error('Error during payment verification or booking creation.'); // Uncomment if you have toast
          console.error('Error verifying payment or creating booking:', error);
        }
      },
      prefill: {
        // --- UPDATED: Use directly destructured properties ---
        name: `${firstName || ''} ${lastName || ''}`.trim() || 'Guest User', // Combine first and last name
        email: email || 'guest@example.com',
        contact: userPhone || '9999999999', // Use userPhone
      },
      notes: {
        villaId: bookingData?.villa,
        checkIn: bookingData?.checkIn,
        checkOut: bookingData?.checkOut,
      },
      theme: {
        color: '#3399CC', // Your brand color
      },
    };

    const rzp1 = new window.Razorpay(options);
    rzp1.on('payment.failed', function (response) {
      // This function is called if the payment fails
      setPaymentStatus(`Payment failed: ${response.error.description}`);
      // toast.error(`Payment failed: ${response.error.description}`); // Uncomment if you have toast
      console.error('Razorpay Payment Failed:', response.error);
      // Handle payment failure, show error message to user
    });

    rzp1.open(); // Open the Razorpay payment modal
  };

  if (!bookingData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-inter">
        <p className="text-red-500 text-lg">Loading booking details or redirecting...</p>
      </div>
    );
  }

  // Display booking summary and payment button
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-700 p-4 font-inter">
      <div className="bg-gray-300 p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-6 text-gray-800 ">Confirm Your Booking & Pay</h1>

        <div className="mb-6 text-left">
          <h3 className="text-xl font-semibold mb-2 text-gray-700">Booking Summary:</h3>
          <p className="text-gray-600"><strong>Villa ID:</strong> {bookingData.villa}</p>
          <p className="text-gray-600"><strong>Check-in:</strong> {new Date(bookingData.checkIn).toLocaleDateString()}</p>
          <p className="text-gray-600"><strong>Check-out:</strong> {new Date(bookingData.checkOut).toLocaleDateString()}</p>
          <p className="text-gray-600"><strong>Nights:</strong> {bookingData.nights}</p>
          <p className="text-gray-600"><strong>Adults:</strong> {bookingData.adults}</p>
          {bookingData.children > 0 && <p className="text-gray-600"><strong>Children:</strong> {bookingData.children}</p>}
          {bookingData.pets > 0 && <p className="text-gray-600"><strong>Pets:</strong> {bookingData.pets}</p>}
          {/* Ensure these are displayed correctly if they are percentages or flat amounts */}
          {bookingData.discountPercentApplied > 0 && <p className="text-gray-600"><strong>Discount:</strong> {bookingData.discountPercentApplied}%</p>}
          {bookingData.couponCode && <p className="text-gray-600"><strong>Coupon:</strong> {bookingData.couponCode}</p>}
          {bookingData.additionalCharges > 0 && <p className="text-gray-600"><strong>Additional Charges:</strong> ₹{(bookingData.additionalCharges / 100).toFixed(2)}</p>}
          <p className="text-3xl font-bold mt-4 text-blue-700">
            Total Amount: ₹{(bookingData.totalAmount / 100).toFixed(2)}
          </p>
        </div>

        <button
          onClick={handleRazorpayPayment}
          disabled={loading || !razorpayLoaded}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75"
        >
          {loading ? 'Processing Payment...' : 'Proceed to Pay'}
        </button>

        {paymentStatus && (
          <p className={`mt-4 text-lg font-medium ${paymentStatus.includes('successful') || paymentStatus.includes('confirmed') ? 'text-green-600' : paymentStatus.includes('failed') ? 'text-red-600' : 'text-gray-600'}`}>
            {paymentStatus}
          </p>
        )}
      </div>
    </div>
  );
};

export default PaymentPage;
