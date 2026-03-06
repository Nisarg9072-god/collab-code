export const openRazorpayCheckout = (options: any) => {
  // @ts-ignore
  if (!window.Razorpay) {
    alert("Razorpay SDK not loaded. Please check your internet connection.");
    return;
  }
  // @ts-ignore
  const rzp = new window.Razorpay(options);
  rzp.open();
};
