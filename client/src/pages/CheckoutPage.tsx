import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/UI/card";
import { Button } from "@/components/UI/button";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Check, CreditCard, Smartphone, Building2, ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

const plansInfo = {
    FREE: { price: "₹0", usage: "2 hours/day", members: "6" },
    PRO: { price: "₹1500", usage: "6 hours/day", members: "6" },
    PREMIUM: { price: "₹2200", usage: "8 hours/day", members: "8" },
    ULTRA: { price: "₹3000", usage: "Unlimited", members: "10" }
};

const CheckoutPage = () => {
    const { plan } = useParams<{ plan: string }>();
    const planName = plan?.toUpperCase() as keyof typeof plansInfo;
    const planData = plansInfo[planName];
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState<string>("upi");

    useEffect(() => {
        if (!planData) {
            navigate("/pricing");
        }
    }, [planData, navigate]);

    if (!planData) return null;

    const handlePayment = async () => {
        if (!user) {
            sessionStorage.setItem("cc.redirectAfterLogin", `/checkout/${plan}`);
            navigate("/login");
            return;
        }

        setIsProcessing(true);
        try {
            const response = await api.payment.createOrder(planName);
            const order = response; // safeFetch unwraps 'data' if present

            if (order.isTest) {
                toast({
                    title: "Test Mode Active",
                    description: `Simulating ${selectedMethod.toUpperCase()} payment for ${planName} plan...`,
                });

                // Call verify for mock as well to update server state if it handles mock
                await api.payment.verify({
                    razorpay_order_id: order.orderId,
                    plan: planName
                });

                setTimeout(() => {
                    localStorage.setItem("cc.plan", planName);
                    navigate("/payment-success");
                }, 2000);
                return;
            }

            const options: any = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency || "INR",
                name: "CollabCode",
                description: `${planName} Plan Subscription`,
                order_id: order.orderId,
                prefill: {
                    name: user.name || "",
                    email: user.email || ""
                },
                notes: { plan: planName, method: selectedMethod },
                theme: { color: "#06b6d4" },
                modal: {
                    ondismiss: () => setIsProcessing(false)
                },
                handler: async function (response: any) {
                    try {
                        setIsProcessing(true);
                        await api.payment.verify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            plan: planName
                        });

                        localStorage.setItem("cc.plan", planName);
                        navigate("/payment-success");
                    } catch (verifyErr: any) {
                        toast({
                            variant: "destructive",
                            title: "Verification Failed",
                            description: verifyErr?.message || "Payment verification failed. Please contact support.",
                        });
                    } finally {
                        setIsProcessing(false);
                    }
                },
            };

            // @ts-ignore
            const rzp = new window.Razorpay(options);
            rzp.open();
        } catch (e: any) {
            console.error(e);
            toast({
                variant: "destructive",
                title: "Payment Error",
                description: e?.message || "Failed to initiate payment flow. Please try again.",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <Navbar />

            <main className="flex-1 pt-32 pb-24 px-6 relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="mx-auto max-w-4xl relative z-10">
                    <button
                        onClick={() => navigate("/pricing")}
                        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        Back to Pricing
                    </button>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                        {/* Order Summary */}
                        <div className="md:col-span-2 space-y-6">
                            <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
                                <CardHeader className="bg-muted/30">
                                    <CardTitle>Order Summary</CardTitle>
                                    <CardDescription>Review your plan details</CardDescription>
                                </CardHeader>
                                <CardContent className="pt-6 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Plan</span>
                                        <span className="font-bold text-teal-500">{planName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-muted-foreground">Price</span>
                                        <span className="text-xl font-bold">{planData.price}</span>
                                    </div>
                                    <div className="border-t border-border/50 pt-4 space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Check className="w-4 h-4 text-teal-500" />
                                            {planData.usage} access
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Check className="w-4 h-4 text-teal-500" />
                                            Up to {planData.members} members
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="flex items-center gap-2 text-sm text-muted-foreground px-2">
                                <ShieldCheck className="w-4 h-4 text-teal-500" />
                                Secure 256-bit SSL encrypted payment
                            </div>
                        </div>

                        {/* Payment Methods */}
                        <div className="md:col-span-3">
                            <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-xl shadow-teal-500/5">
                                <CardHeader>
                                    <CardTitle>Payment Method</CardTitle>
                                    <CardDescription>Select your preferred way to pay</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-1 gap-3">
                                        {[
                                            { id: "upi", name: "UPI (Google Pay, PhonePe, etc.)", icon: Smartphone },
                                            { id: "card", name: "Credit / Debit Card", icon: CreditCard },
                                            { id: "netbanking", name: "Net Banking", icon: Building2 }
                                        ].map((method) => (
                                            <button
                                                key={method.id}
                                                onClick={() => setSelectedMethod(method.id)}
                                                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${selectedMethod === method.id
                                                    ? 'border-teal-500 bg-teal-500/5'
                                                    : 'border-border/50 hover:border-border bg-transparent'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2 rounded-lg ${selectedMethod === method.id ? 'bg-teal-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                                                        <method.icon className="w-5 h-5" />
                                                    </div>
                                                    <span className="font-medium">{method.name}</span>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedMethod === method.id ? 'border-teal-500 bg-teal-500' : 'border-muted'}`}>
                                                    {selectedMethod === method.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    <Button
                                        onClick={handlePayment}
                                        disabled={isProcessing}
                                        className="w-full h-14 text-lg font-bold bg-teal-500 hover:bg-teal-600 text-white shadow-lg shadow-teal-500/20"
                                    >
                                        {isProcessing ? (
                                            <>
                                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                                Processing Securely...
                                            </>
                                        ) : (
                                            `Pay ${planData.price} Securely`
                                        )}
                                    </Button>

                                    <p className="text-center text-xs text-muted-foreground">
                                        By clicking "Pay", you agree to CollabCode's Terms of Service and Privacy Policy.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default CheckoutPage;
