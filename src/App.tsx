import React, { useState, useEffect, Component } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, 
  PenTool, 
  Image as ImageIcon, 
  User, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Globe, 
  Award, 
  Package,
  Plus,
  Trash2,
  Loader2,
  LogIn,
  Clock,
  XCircle,
  Printer,
  X,
  LayoutDashboard,
  Settings,
  Bell,
  LogOut,
  ChevronRight,
  Download,
  Share2,
  Facebook,
  Twitter,
  Instagram,
  Star,
  Camera,
  AlertCircle,
  Sun,
  Moon,
  BarChart3,
  FileText
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs,
  updateDoc,
  doc,
  onSnapshot,
  setDoc,
  getDocFromServer,
  deleteDoc
} from 'firebase/firestore';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { cn } from './lib/utils';
import html2canvas from 'html2canvas';
import { Toaster, toast } from 'sonner';

// --- Types & Schemas ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const submissionSchema = z.object({
  submissionType: z.enum(["poem", "story"]),
  authorName: z.string().min(2, "নাম অবশ্যই ২ অক্ষরের বেশি হতে হবে"),
  authorBio: z.string().min(10, "পরিচয় অন্তত ১০ অক্ষরের হতে হবে"),
  authorPhoto: z.string().optional(),
  package: z.enum(["1", "2", "3", "4", "10"]), // Added "1" and "3" for stories
  transactionId: z.string().min(8, "সঠিক ট্রানজেকশন আইডি দিন"),
  poems: z.array(z.object({
    text: z.string().min(20, "লেখাটি অন্তত ২০ অক্ষরের হতে হবে")
  })).min(1),
  plagiarismChecked: z.boolean().refine(val => val === true, "আপনাকে নিশ্চিত করতে হবে যে লেখাটি সম্পূর্ণ মৌলিক"),
}).superRefine((data, ctx) => {
  if (data.submissionType === 'story') {
    data.poems.forEach((poem, index) => {
      const wordCount = poem.text.trim().split(/\s+/).filter(w => w.length > 0).length;
      if (wordCount < 800 || wordCount > 2000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `গল্পের শব্দ সংখ্যা ৮০০ থেকে ২০০০ এর মধ্যে হতে হবে (বর্তমান শব্দ: ${wordCount})`,
          path: ["poems", index, "text"]
        });
      }
    });
  }
});

type SubmissionFormValues = z.infer<typeof submissionSchema>;

// --- Components ---

class ErrorBoundary extends Component<any, any> {
  state: any;
  props: any;
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsedError = JSON.parse(this.state.error.message);
        errorMessage = `Firestore Error: ${parsedError.error} during ${parsedError.operationType} on ${parsedError.path}`;
      } catch (e) {
        errorMessage = this.state.error.message || String(this.state.error);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <Card className="max-w-md w-full text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Error</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <Button onClick={() => window.location.reload()}>
              Reload Application
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: any) => {
  const variants = {
    primary: 'bg-accent text-white hover:bg-opacity-90',
    secondary: 'bg-ink text-white hover:bg-opacity-90',
    outline: 'border border-ink text-ink hover:bg-ink hover:text-white',
    ghost: 'hover:bg-accent/10 text-accent',
  };
  
  return (
    <motion.button 
      className={cn(
        'px-6 py-3 rounded-full font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
};

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; key?: React.Key; onClick?: () => void }) => (
  <div className={cn('bg-white p-8 rounded-[32px] shadow-sm border border-black/5', className)} onClick={onClick}>
    {children}
  </div>
);

const googleProvider = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentView, setCurrentView] = useState<'landing' | 'author' | 'admin'>('landing');
  const [allSubmissions, setAllSubmissions] = useState<any[]>([]);
  const [certificateSubmission, setCertificateSubmission] = useState<any | null>(null);
  const [step, setStep] = useState(0); // 0: Landing, 1: Type, 2: Package, 3: Payment, 4: Info, 5: Poems, 6: Success
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSubmissions, setUserSubmissions] = useState<any[]>([]);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [tempProfile, setTempProfile] = useState<any>(null);

  const formatUrl = (url: string) => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    return `https://${url}`;
  };
  const [activeTab, setActiveTab] = useState<'overview' | 'certificates' | 'drafts'>('overview');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [feedbackModal, setFeedbackModal] = useState<{ isOpen: boolean; submissionId: string; status: string; currentFeedback: string }>({ isOpen: false, submissionId: '', status: '', currentFeedback: '' });
  const [adminFilter, setAdminFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [adminTab, setAdminTab] = useState<'submissions' | 'users' | 'analytics'>('submissions');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true';
    }
    return false;
  });

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors, isValid } } = useForm<SubmissionFormValues>({
    resolver: zodResolver(submissionSchema),
    mode: "onChange",
    defaultValues: {
      submissionType: "poem",
      package: "2",
      transactionId: "",
      poems: [{ text: "" }, { text: "" }],
      plagiarismChecked: false,
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "poems"
  });

  const selectedType = watch("submissionType");
  const selectedPackage = watch("package");

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [darkMode]);

  // Real-time notifications for status changes
  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, "submissions"), where("authorUID", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const newData = change.doc.data();
          const oldData = userSubmissions.find(s => s.id === change.doc.id);
          
          if (oldData && oldData.status !== newData.status) {
            const statusMap: any = {
              approved: 'অনুমোদিত',
              rejected: 'প্রত্যাখ্যাত',
              pending: 'অপেক্ষমান'
            };
            toast.info(`আপনার লেখার স্ট্যাটাস পরিবর্তন হয়েছে: ${statusMap[newData.status] || newData.status}`, {
              description: newData.feedback ? `ফিডব্যাক: ${newData.feedback}` : undefined,
              duration: 5000,
            });
          }
        }
      });
      
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserSubmissions(subs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'submissions');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      const isUserAdmin = u?.email === "shahinalam3546@gmail.com" && u?.emailVerified === true;
      setIsAdmin(isUserAdmin);
      
      if (u) {
        if (isUserAdmin) {
          setCurrentView('admin');
        } else {
          setCurrentView('author');
        }
      } else {
        setCurrentView('landing');
      }
      
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }

    console.log("Fetching profile for user:", user.uid, "Is Admin:", isAdmin);

    const unsubscribe = onSnapshot(doc(db, "profiles", user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const profile = snapshot.data();
        setUserProfile(profile);
        // Pre-fill form with profile data if not editing
        if (!editingSubmissionId) {
          setValue("authorName", profile.displayName || "");
          setValue("authorBio", profile.bio || "");
          setValue("authorPhoto", profile.photoURL || "");
        }
      } else {
        // Create initial profile if it doesn't exist
        const initialProfile = {
          displayName: user.displayName || "",
          email: user.email || "",
          uid: user.uid,
          photoURL: user.photoURL || "",
          updatedAt: serverTimestamp()
        };
        setDoc(doc(db, "profiles", user.uid), initialProfile).catch((err) => {
          console.error("Error creating initial profile:", err);
        });
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `profiles/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, setValue, editingSubmissionId]);

  useEffect(() => {
    if (!user || !isAdmin) {
      setAllSubmissions([]);
      setAllUsers([]);
      return;
    }

    let isInitialLoad = true;
    const q = query(collection(db, "submissions"));
    const unsubscribeSubmissions = onSnapshot(q, (snapshot) => {
      const submissions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllSubmissions(submissions);

      if (!isInitialLoad) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            toast.success(`নতুন সাবমিশন: ${data.authorName} থেকে`);
          }
        });
      }
      isInitialLoad = false;
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "submissions");
    });

    const qUsers = query(collection(db, "profiles"));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const users = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(users);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "profiles");
    });

    return () => {
      unsubscribeSubmissions();
      unsubscribeUsers();
    };
  }, [user, isAdmin]);

  useEffect(() => {
    if (!user) {
      setUserSubmissions([]);
      return;
    }

    const q = query(collection(db, "submissions"), where("uid", "==", user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const submissions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setUserSubmissions(submissions);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "submissions");
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const count = parseInt(selectedPackage);
    const currentCount = fields.length;
    if (count > currentCount) {
      for (let i = 0; i < count - currentCount; i++) append({ text: "" });
    } else if (count < currentCount) {
      for (let i = 0; i < currentCount - count; i++) remove(currentCount - 1 - i);
    }
  }, [selectedPackage, append, remove, fields.length]);

  const handleSignIn = async () => {
    try {
      setError(null);
      const provider = new GoogleAuthProvider();
      // Set custom parameters to force account selection if needed
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("Sign in error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("পপ-আপ ব্লক করা হয়েছে। দয়া করে পপ-আপ এলাউ করুন অথবা নতুন ট্যাবে ওপেন করুন।");
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignore user cancellation
      } else {
        setError("লগইন করতে সমস্যা হয়েছে। দয়া করে ব্রাউজার রিফ্রেশ করুন অথবা নতুন ট্যাবে ওপেন করুন।");
      }
    }
  };

  const handleSignOut = () => {
    signOut(auth);
    setCurrentView('landing');
    setStep(0);
  };

  const handleDownloadCertificate = async () => {
    const element = document.getElementById('certificate-content');
    if (!element) return;
    
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FDFBF7'
      });
      
      const link = document.createElement('a');
      link.download = `certificate-${certificateSubmission?.authorName || 'author'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Error downloading certificate:", err);
    }
  };

  const handleEdit = (submission: any) => {
    setEditingSubmissionId(submission.id);
    reset({
      submissionType: submission.submissionType || "poem",
      authorName: submission.authorName,
      authorBio: submission.authorBio,
      authorPhoto: submission.authorPhoto || "",
      package: submission.package,
      transactionId: submission.transactionId || "",
      poems: submission.poems.map((p: string) => ({ text: p })),
      plagiarismChecked: submission.plagiarismChecked || false,
    });
    setStep(1);
  };

  const handleUpdateStatus = async (id: string, status: string, feedback?: string) => {
    try {
      const updateData: any = { status };
      if (feedback !== undefined) {
        updateData.adminFeedback = feedback;
      }
      await updateDoc(doc(db, "submissions", id), updateData);
    } catch (err) {
      console.error("Error updating status:", err);
    }
  };

  const handleDeleteSubmission = async (id: string) => {
    if (window.confirm("আপনি কি নিশ্চিত যে এই লেখাটি মুছে ফেলতে চান?")) {
      try {
        await deleteDoc(doc(db, "submissions", id));
      } catch (err) {
        console.error("Error deleting submission:", err);
      }
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Author Name', 'Email', 'Type', 'Package', 'Status', 'Transaction ID', 'Created At'];
    const rows = allSubmissions.map(sub => [
      sub.id,
      `"${sub.authorName}"`,
      sub.authorEmail,
      sub.submissionType,
      sub.package,
      sub.status,
      sub.transactionId || '',
      sub.createdAt?.toDate?.()?.toLocaleString() || ''
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'submissions.csv';
    link.click();
  };

  const onSubmit = async (data: SubmissionFormValues, isDraft = false) => {
    if (!user) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const submissionData = {
        ...data,
        poems: data.poems.map(p => p.text),
        authorUID: user.uid,
        authorEmail: user.email,
        status: isDraft ? "draft" : "pending",
        updatedAt: serverTimestamp(),
      };

      if (editingSubmissionId) {
        await updateDoc(doc(db, "submissions", editingSubmissionId), submissionData);
      } else {
        await addDoc(collection(db, "submissions"), {
          ...submissionData,
          createdAt: serverTimestamp(),
        });
      }
      
      if (isDraft) {
        toast.success("ড্রাফট হিসেবে সংরক্ষণ করা হয়েছে");
        setCurrentView('author');
        setStep(0);
      } else {
        setStep(6);
      }
      setEditingSubmissionId(null);
    } catch (err) {
      console.error("Submission error:", err);
      setError("জমা দিতে সমস্যা হয়েছে। দয়া করে আপনার ইন্টারনেট সংযোগ চেক করুন।");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-right" />
      <div className="min-h-screen selection:bg-accent selection:text-white">
        {/* Navigation */}
        <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex justify-between items-center bg-paper/80 backdrop-blur-md border-b border-black/5">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setCurrentView('landing'); setStep(0); }}>
            <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif font-bold text-lg tracking-tight leading-none">আমাদের সমাজ</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">প্রকাশনী</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <button 
              onClick={() => { setCurrentView('landing'); setStep(0); }}
              className={cn("text-sm font-medium transition-colors", currentView === 'landing' ? "text-accent" : "text-ink/60 hover:text-ink")}
            >
              হোম
            </button>
            {user && (
              <button 
                onClick={() => { setCurrentView('author'); setStep(0); }}
                className={cn("text-sm font-medium transition-colors", currentView === 'author' ? "text-accent" : "text-ink/60 hover:text-ink")}
              >
                লেখক ড্যাশবোর্ড
              </button>
            )}
            {user && isAdmin && (
              <button 
                onClick={() => { setCurrentView('admin'); setStep(0); }}
                className={cn("text-sm font-medium transition-colors", currentView === 'admin' ? "text-accent" : "text-ink/60 hover:text-ink")}
              >
                এডমিন প্যানেল
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-10 h-10 rounded-xl bg-accent/5 flex items-center justify-center text-accent hover:bg-accent/10 transition-all"
            title={darkMode ? "লাইট মোড" : "ডার্ক মোড"}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {user ? (
            <div className="flex items-center gap-4">
              {isAdmin && (
                <div className="relative">
                  <button 
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="p-2 hover:bg-black/5 rounded-full transition-colors relative"
                  >
                    <Bell className="w-5 h-5 text-ink/80" />
                    {allSubmissions.filter(s => s.status === 'pending').length > 0 && (
                      <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-paper"></span>
                    )}
                  </button>
                  
                  <AnimatePresence>
                    {showNotifications && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-black/5 overflow-hidden z-50"
                      >
                        <div className="p-4 border-b border-black/5 flex justify-between items-center bg-gray-50/50">
                          <h3 className="font-bold text-sm">নোটিফিকেশন</h3>
                          <span className="text-xs font-medium bg-accent/10 text-accent px-2 py-1 rounded-full">
                            {allSubmissions.filter(s => s.status === 'pending').length} নতুন
                          </span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                          {allSubmissions.filter(s => s.status === 'pending').length === 0 ? (
                            <div className="p-8 text-center text-ink/60 text-sm">
                              কোন নতুন নোটিফিকেশন নেই
                            </div>
                          ) : (
                            allSubmissions
                              .filter(s => s.status === 'pending')
                              .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
                              .map(sub => (
                                <div 
                                  key={sub.id} 
                                  className="p-4 border-b border-black/5 hover:bg-gray-50 transition-colors cursor-pointer"
                                  onClick={() => {
                                    setCurrentView('admin');
                                    setAdminFilter('pending');
                                    setShowNotifications(false);
                                  }}
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                                      <BookOpen className="w-4 h-4 text-accent" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium line-clamp-1">{sub.authorName}</p>
                                      <p className="text-xs text-ink/60 mt-0.5">
                                        নতুন {sub.submissionType === 'poem' ? 'কবিতা' : 'গল্প'} জমা দিয়েছেন
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <span className="text-sm font-medium hidden sm:inline">{user.displayName}</span>
              <button onClick={handleSignOut} className="text-sm text-ink/60 hover:text-ink transition-colors">প্রস্থান</button>
            </div>
          ) : (
            <button onClick={handleSignIn} className="flex items-center gap-2 text-sm font-medium hover:text-accent transition-colors">
              <LogIn className="w-4 h-4" /> লগইন
            </button>
          )}
        </div>
      </nav>

      <main className="pt-24 pb-20 px-6 max-w-4xl mx-auto">
        {currentView === 'admin' && isAdmin && step === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-serif font-bold">এডমিন প্যানেল</h2>
              <Button variant="outline" onClick={() => setCurrentView('landing')}>ফিরে যান</Button>
            </div>

            <div className="flex border-b border-black/5 gap-8">
              <button 
                onClick={() => setAdminTab('submissions')}
                className={cn(
                  "pb-4 text-sm font-bold uppercase tracking-wider transition-all relative",
                  adminTab === 'submissions' ? "text-accent" : "text-ink/40 hover:text-ink/60"
                )}
              >
                সাবমিশন ({allSubmissions.length})
                {adminTab === 'submissions' && <motion.div layoutId="adminTab" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
              </button>
              <button 
                onClick={() => setAdminTab('users')}
                className={cn(
                  "pb-4 text-sm font-bold uppercase tracking-wider transition-all relative",
                  adminTab === 'users' ? "text-accent" : "text-ink/40 hover:text-ink/60"
                )}
              >
                ব্যবহারকারী ({allUsers.length})
                {adminTab === 'users' && <motion.div layoutId="adminTab" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
              </button>
              <button 
                onClick={() => setAdminTab('analytics')}
                className={cn(
                  "pb-4 text-sm font-bold uppercase tracking-wider transition-all relative",
                  adminTab === 'analytics' ? "text-accent" : "text-ink/40 hover:text-ink/60"
                )}
              >
                অ্যানালিটিক্স
                {adminTab === 'analytics' && <motion.div layoutId="adminTab" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
              </button>
            </div>

            {adminTab === 'submissions' ? (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1 max-w-md">
                    <input 
                      type="text" 
                      placeholder="নাম, ইমেইল বা TrxID দিয়ে খুঁজুন..." 
                      className="w-full px-4 py-2 border border-black/10 rounded-lg text-sm bg-white focus:border-accent outline-none"
                      value={adminSearchQuery}
                      onChange={(e) => setAdminSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-4">
                    <Button variant="outline" onClick={exportToCSV} className="px-4 py-2 text-sm">
                      <Download className="w-4 h-4 mr-2" /> CSV ডাউনলোড
                    </Button>
                    <select 
                      className="px-4 py-2 border border-black/10 rounded-lg text-sm bg-white"
                      value={adminFilter}
                      onChange={(e) => setAdminFilter(e.target.value as any)}
                    >
                      <option value="all">সবগুলো</option>
                      <option value="pending">যাচাই চলছে</option>
                      <option value="approved">অনুমোদিত</option>
                      <option value="rejected">বাতিল</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {allSubmissions
                    .filter(sub => adminFilter === 'all' || sub.status === adminFilter)
                    .filter(sub => 
                      sub.authorName?.toLowerCase().includes(adminSearchQuery.toLowerCase()) ||
                      sub.authorEmail?.toLowerCase().includes(adminSearchQuery.toLowerCase()) ||
                      sub.transactionId?.toLowerCase().includes(adminSearchQuery.toLowerCase())
                    )
                    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
                    .map((sub) => (
                    <Card key={sub.id} className="p-6 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-xl">{sub.authorName}</h3>
                          <p className="text-sm text-ink/60">{sub.authorEmail}</p>
                          <p className="text-sm text-ink/60">{sub.authorBio}</p>
                          <p className="text-xs text-accent mt-1">{sub.submissionType === 'story' ? 'গল্প' : 'কবিতা'} - {sub.package}টি {sub.submissionType === 'story' ? 'গল্প' : 'কবিতা'}র প্যাকেজ</p>
                          {sub.transactionId && (
                            <p className="text-xs font-mono font-bold text-green-600 mt-2 bg-green-50 inline-block px-2 py-1 rounded">
                              TrxID: {sub.transactionId}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            sub.status === 'pending' ? "bg-orange-50 text-orange-600 border border-orange-100" : 
                            sub.status === 'approved' ? "bg-green-50 text-green-600 border border-green-100" : 
                            "bg-red-50 text-red-600 border border-red-100"
                          )}>
                            {sub.status === 'pending' ? "যাচাই চলছে" : 
                             sub.status === 'approved' ? "অনুমোদিত" : "বাতিল"}
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => setFeedbackModal({ isOpen: true, submissionId: sub.id, status: 'approved', currentFeedback: sub.adminFeedback || '' })}
                              disabled={sub.status === 'approved'}
                            >
                              অনুমোদন
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => setFeedbackModal({ isOpen: true, submissionId: sub.id, status: 'rejected', currentFeedback: sub.adminFeedback || '' })}
                              disabled={sub.status === 'rejected'}
                            >
                              বাতিল
                            </Button>
                            {sub.status === 'approved' && (
                              <Button 
                                size="sm" 
                                variant="default" 
                                className="bg-accent text-white hover:bg-accent/90"
                                onClick={() => setCertificateSubmission(sub)}
                              >
                                সার্টিফিকেট
                              </Button>
                            )}
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDeleteSubmission(sub.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-black/5 space-y-4">
                        {sub.poems.map((poem: string, idx: number) => (
                          <div key={idx} className="p-4 bg-paper rounded-xl italic text-sm text-ink/80">
                            {poem}
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
                  {allSubmissions.filter(sub => adminFilter === 'all' || sub.status === adminFilter).length === 0 && (
                    <div className="text-center py-20 text-ink/40 italic">
                      কোন সাবমিশন পাওয়া যায়নি।
                    </div>
                  )}
                </div>
              </div>
            ) : adminTab === 'users' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {allUsers.map((u) => (
                  <Card key={u.id} className="p-6 flex items-center gap-4">
                    {u.photoURL ? (
                      <img src={u.photoURL} alt={u.displayName} className="w-16 h-16 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
                        <User className="w-8 h-8 text-accent" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-lg">{u.displayName || 'নাম নেই'}</h3>
                      <p className="text-sm text-ink/60">{u.email}</p>
                      <div className="flex gap-2 mt-2">
                        {u.facebook && <a href={u.facebook} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700"><Facebook className="w-4 h-4" /></a>}
                        {u.twitter && <a href={u.twitter} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-500"><Twitter className="w-4 h-4" /></a>}
                        {u.instagram && <a href={u.instagram} target="_blank" rel="noreferrer" className="text-pink-600 hover:text-pink-700"><Instagram className="w-4 h-4" /></a>}
                        {u.website && <a href={u.website} target="_blank" rel="noreferrer" className="text-accent hover:text-accent/80"><Globe className="w-4 h-4" /></a>}
                      </div>
                    </div>
                  </Card>
                ))}
                {allUsers.length === 0 && (
                  <div className="col-span-full text-center py-20 text-ink/40 italic">
                    কোন ব্যবহারকারী পাওয়া যায়নি।
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <Card className="p-6 bg-accent text-white">
                    <p className="text-xs font-bold uppercase tracking-widest opacity-60">মোট লেখক</p>
                    <p className="text-3xl font-serif font-bold mt-2">{allUsers.length}</p>
                  </Card>
                  <Card className="p-6 bg-white border-black/5">
                    <p className="text-xs font-bold uppercase tracking-widest text-ink/40">মোট সাবমিশন</p>
                    <p className="text-3xl font-serif font-bold mt-2">{allSubmissions.length}</p>
                  </Card>
                  <Card className="p-6 bg-white border-black/5">
                    <p className="text-xs font-bold uppercase tracking-widest text-ink/40">অনুমোদিত</p>
                    <p className="text-3xl font-serif font-bold mt-2 text-green-600">{allSubmissions.filter(s => s.status === 'approved').length}</p>
                  </Card>
                  <Card className="p-6 bg-white border-black/5">
                    <p className="text-xs font-bold uppercase tracking-widest text-ink/40">প্রত্যাখ্যাত</p>
                    <p className="text-3xl font-serif font-bold mt-2 text-red-500">{allSubmissions.filter(s => s.status === 'rejected').length}</p>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <Card className="lg:col-span-2 p-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-serif font-bold text-xl flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-accent" /> সাবমিশন ট্রেন্ড (শেষ ৭ দিন)
                      </h3>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={[...Array(7)].map((_, i) => {
                          const d = new Date();
                          d.setDate(d.getDate() - (6 - i));
                          const dateStr = d.toISOString().split('T')[0];
                          return {
                            name: d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'short' }),
                            count: allSubmissions.filter(s => {
                              const subDate = s.createdAt?.toDate?.().toISOString().split('T')[0];
                              return subDate === dateStr;
                            }).length
                          };
                        })}>
                          <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'rgba(0,0,0,0.4)'}} />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: 'rgba(0,0,0,0.4)'}} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                          />
                          <Area type="monotone" dataKey="count" stroke="var(--color-accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-8 space-y-6">
                    <h3 className="font-serif font-bold text-xl">সাবমিশন টাইপ</h3>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'কবিতা', value: allSubmissions.filter(s => s.submissionType === 'poem').length },
                              { name: 'গল্প', value: allSubmissions.filter(s => s.submissionType === 'story').length }
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill="var(--color-accent)" />
                            <Cell fill="#f97316" />
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">কবিতা</span>
                        <span className="text-sm font-bold">{allSubmissions.filter(s => s.submissionType === 'poem').length}</span>
                      </div>
                      <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-accent" 
                          style={{ width: `${(allSubmissions.filter(s => s.submissionType === 'poem').length / (allSubmissions.length || 1)) * 100}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">গল্প</span>
                        <span className="text-sm font-bold">{allSubmissions.filter(s => s.submissionType === 'story').length}</span>
                      </div>
                      <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-orange-500" 
                          style={{ width: `${(allSubmissions.filter(s => s.submissionType === 'story').length / (allSubmissions.length || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="p-8 space-y-6">
                    <h3 className="font-serif font-bold text-xl">প্যাকেজ ডিস্ট্রিবিউশন</h3>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={['1', '2', '3', '4', '10'].map((pkg, idx) => ({
                              name: `Pkg ${pkg}`,
                              value: allSubmissions.filter(s => s.package === pkg).length
                            }))}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                          >
                            {['1', '2', '3', '4', '10'].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={[`#8b5cf6`, `#3b82f6`, `#10b981`, `#f59e0b`, `#ef4444`][index % 5]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="p-8 space-y-6">
                    <h3 className="font-serif font-bold text-xl">প্যাকেজ ডিটেইলস</h3>
                    <div className="space-y-4">
                      {['1', '2', '3', '4', '10'].map((pkg, idx) => (
                        <div key={pkg} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium">প্যাকেজ {pkg}</span>
                            <span className="text-sm font-bold">{allSubmissions.filter(s => s.package === pkg).length}</span>
                          </div>
                          <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full" 
                              style={{ 
                                width: `${(allSubmissions.filter(s => s.package === pkg).length / (allSubmissions.length || 1)) * 100}%`,
                                backgroundColor: [`#8b5cf6`, `#3b82f6`, `#10b981`, `#f59e0b`, `#ef4444`][idx % 5]
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <>
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply z-50 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
            <AnimatePresence mode="wait">
            {step === 0 && currentView === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-7xl mx-auto space-y-24 pb-24"
            >
              {/* Hero Section */}
              <section className="min-h-[85vh] flex flex-col lg:flex-row items-center justify-between gap-16 py-12">
                <div className="flex-1 space-y-12">
                  <div className="space-y-8">
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-4"
                    >
                      <span className="badge">যৌথ কাব্যগ্রন্থ ২০২৬</span>
                      <span className="w-12 h-px bg-accent/20" />
                      <span className="text-xs font-bold uppercase tracking-widest text-accent/50">লেখক আহ্বান</span>
                    </motion.div>

                    <motion.h1 
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="editorial-title leading-[0.85]"
                    >
                      আপনার কবিতা <br /> 
                      <span className="italic text-accent relative">
                        বিশ্বজুড়ে
                        <svg className="absolute -bottom-2 left-0 w-full h-3 text-accent/20" viewBox="0 0 100 10" preserveAspectRatio="none">
                          <path d="M0 5 Q 25 0, 50 5 T 100 5" fill="none" stroke="currentColor" strokeWidth="4" />
                        </svg>
                      </span>
                      <br /> প্রকাশিত হোক
                    </motion.h1>

                    <motion.p 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-xl text-ink/60 max-w-xl leading-relaxed font-serif italic"
                    >
                      আমাদের সমাজ প্রকাশনী থেকে প্রকাশিত হতে যাচ্ছে একটি ব্যতিক্রমধর্মী যৌথ কাব্যগ্রন্থ, যা একসাথে 🌍 <span className="text-ink font-bold">Amazon</span>, <span className="text-ink font-bold">Google</span> সহ ১৫০+ আন্তর্জাতিক প্ল্যাটফর্মে প্রকাশিত হবে।
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="flex items-center gap-8 pt-4"
                    >
                      <div className="flex -space-x-3">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="w-10 h-10 rounded-full border-2 border-paper bg-accent-light flex items-center justify-center overflow-hidden">
                            <img src={`https://picsum.photos/seed/author${i}/40/40`} alt="Author" referrerPolicy="no-referrer" />
                          </div>
                        ))}
                      </div>
                      <div className="text-sm font-medium text-ink/40">
                        <span className="text-ink font-bold">৫০০+</span> লেখক আমাদের সাথে যুক্ত
                      </div>
                    </motion.div>
                  </div>

                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-wrap gap-6"
                  >
                    {!user ? (
                      <Button 
                        onClick={handleSignIn} 
                        className="text-xl px-12 py-8 gap-4 bg-accent hover:bg-accent/90 shadow-strong rounded-full transition-all hover:scale-105 active:scale-95"
                      >
                        <LogIn className="w-6 h-6" /> গুগল দিয়ে শুরু করুন
                      </Button>
                    ) : (
                      <Button 
                        onClick={() => {
                          setEditingSubmissionId(null);
                          reset({
                            submissionType: "poem",
                            authorName: userProfile?.displayName || user.displayName || "",
                            authorBio: userProfile?.bio || "",
                            authorPhoto: userProfile?.photoURL || user.photoURL || "",
                            package: "2",
                            poems: [{ text: "" }, { text: "" }],
                          });
                          setStep(1);
                        }} 
                        className="text-xl px-12 py-8 group bg-accent hover:bg-accent/90 shadow-strong rounded-full transition-all hover:scale-105 active:scale-95"
                      >
                        লেখা জমা দিন <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      className="text-xl px-12 py-8 rounded-full border-accent/20 hover:bg-accent/5 transition-all hover:scale-105 active:scale-95" 
                      onClick={() => {
                        const element = document.getElementById('how-it-works');
                        element?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      বিস্তারিত জানুন
                    </Button>
                  </motion.div>
                </div>

                <div className="flex-1 relative hidden lg:block">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1, 
                      rotate: 0,
                      y: [0, -10, 0]
                    }}
                    transition={{ 
                      duration: 1, 
                      ease: "easeOut",
                      y: {
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }
                    }}
                    className="relative z-10"
                  >
                    <div className="w-[480px] h-[640px] glass-card rounded-[48px] p-16 flex flex-col justify-between shadow-strong border-white/40">
                      <div className="space-y-8">
                        <div className="w-20 h-1 bg-accent/30" />
                        <h2 className="text-5xl font-serif font-bold italic tracking-tight">আমাদের <br />সমাজ</h2>
                        <p className="text-ink/50 font-serif text-lg leading-relaxed italic">
                          "শব্দের বুননে গড়ে তুলি এক নতুন পৃথিবী, যেখানে প্রতিটি গল্প পায় তার নিজস্ব আকাশ।"
                        </p>
                      </div>
                      <div className="space-y-6">
                        <div className="flex items-center gap-5">
                          <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center">
                            <PenTool className="w-7 h-7 text-accent" />
                          </div>
                          <div>
                            <p className="font-bold text-lg">৫০০+ লেখক</p>
                            <p className="text-sm text-ink/40">ইতিমধ্যেই যুক্ত হয়েছেন</p>
                          </div>
                        </div>
                        <div className="w-full h-px bg-black/5" />
                        <div className="flex justify-between items-center">
                          <span className="micro-label">২০২৬ সংকলন</span>
                          <BookOpen className="w-6 h-6 text-accent/40" />
                        </div>
                      </div>
                    </div>
                    {/* Decorative elements */}
                    <div className="absolute -top-20 -right-20 w-80 h-80 bg-accent/5 rounded-full blur-[100px] -z-10" />
                    <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-orange-500/5 rounded-full blur-[100px] -z-10" />
                  </motion.div>
                </div>
              </section>

              {/* How it Works */}
              <section id="how-it-works" className="py-24 space-y-24">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center space-y-6"
                  >
                    <div className="micro-label">থিম</div>
                    <h2 className="text-5xl font-serif font-bold">আপনার অনুভূতির গভীরতম প্রকাশ</h2>
                    <p className="text-ink/50 max-w-lg mx-auto text-lg font-serif italic">প্রেম, বিরহ, বিদ্রোহ, স্মৃতি, আত্মজিজ্ঞাসা—আপনার যেকোনো মৌলিক কবিতা আমাদের প্রত্যাশা</p>
                  </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-16 relative">
                  <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-accent/10 -z-10" />
                  {[
                    { icon: LogIn, title: "লগইন করুন", desc: "গুগল দিয়ে সহজে অ্যাকাউন্ট তৈরি করুন" },
                    { icon: Package, title: "প্যাকেজ বাছুন", desc: "আপনার পছন্দমতো প্যাকেজ নির্বাচন করুন" },
                    { icon: PenTool, title: "লেখা জমা দিন", desc: "আপনার কবিতা বা গল্প আপলোড করুন" },
                    { icon: Globe, title: "বিশ্বজুড়ে প্রকাশ", desc: "বই আকারে প্রকাশিত হবে আন্তর্জাতিকভাবে" }
                  ].map((step, i) => (
                    <motion.div 
                      key={i} 
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="flex flex-col items-center text-center space-y-8 px-4"
                    >
                      <div className="w-20 h-20 rounded-3xl bg-white shadow-strong border border-black/5 flex items-center justify-center text-accent group hover:bg-accent hover:text-white transition-all duration-500">
                        <step.icon className="w-10 h-10" />
                      </div>
                      <div className="space-y-3">
                        <h3 className="font-bold text-xl">০{i+1}. {step.title}</h3>
                        <p className="text-base text-ink/50 leading-relaxed font-serif italic">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* Features Grid */}
              <section className="py-24 space-y-24">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center space-y-6"
                  >
                    <div className="micro-label">সুবিধাসমূহ</div>
                    <h2 className="text-5xl font-serif font-bold">কেন আমাদের সাথে লিখবেন?</h2>
                    <p className="text-ink/50 max-w-lg mx-auto text-lg font-serif italic">আমরা শুধুমাত্র বই প্রকাশ করি না, আমরা আপনার লেখক সত্তাকে মূল্যায়ন করি</p>
                  </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                  {[
                    { icon: Globe, title: "আন্তর্জাতিক প্রকাশনা", desc: "Amazon, Google Books সহ বিশ্বের ১৫০+ প্ল্যাটফর্মে আপনার বই প্রকাশিত হবে।" },
                    { icon: Award, title: "লেখক সার্টিফিকেট", desc: "অংশগ্রহণকারী সকল লেখকদের জন্য থাকছে আকর্ষণীয় ডিজিটাল ও প্রিন্টেড সার্টিফিকেট।" },
                    { icon: PenTool, title: "ISBN ও প্রফেশনাল ডিজাইন", desc: "প্রতিটি বই আন্তর্জাতিক মানদণ্ড অনুযায়ী ISBN নম্বর এবং প্রফেশনাল কভার ডিজাইন সহ প্রকাশিত হবে।" },
                    { icon: Star, title: "প্রফেশনাল এডিটিং", desc: "আমাদের অভিজ্ঞ এডিটর প্যানেল প্রতিটি লেখা যত্ন সহকারে যাচাই এবং পরিমার্জন করে থাকে।" },
                    { icon: ImageIcon, title: "আকর্ষণীয় প্রচ্ছদ", desc: "বইয়ের বিষয়বস্তুর সাথে মিল রেখে প্রফেশনাল গ্রাফিক ডিজাইনার দ্বারা প্রচ্ছদ তৈরি করা হয়।" },
                    { icon: Share2, title: "মার্কেটিং সাপোর্ট", desc: "সো্যাল মিডিয়া এবং বিভিন্ন অনলাইন প্ল্যাটফর্মে আপনার লেখার প্রচারণা চালানো হবে।" }
                  ].map((item, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <Card className="p-10 space-y-8 glass-card hover:shadow-strong transition-all duration-700 border-white/40 group rounded-[40px]">
                        <div className="w-14 h-14 rounded-2xl bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500">
                          <item.icon className="w-7 h-7" />
                        </div>
                        <div className="space-y-4">
                          <h3 className="font-serif font-bold text-2xl">{item.title}</h3>
                          <p className="text-base text-ink/50 leading-relaxed font-serif italic">{item.desc}</p>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* CTA Section */}
              <section className="relative py-32 rounded-[80px] bg-accent overflow-hidden text-center text-white shadow-strong">
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_white_0%,_transparent_70%)]" />
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                </div>
                  <motion.div 
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="relative z-10 space-y-12 px-6"
                  >
                    <div className="space-y-6">
                      <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">আপনার যাত্রা</div>
                      <h2 className="editorial-title text-white">আপনার লেখক যাত্রা <br /> শুরু হোক আজই</h2>
                    </div>
                    <p className="text-white/60 max-w-xl mx-auto text-xl font-serif italic leading-relaxed">
                      আমাদের সমাজ প্রকাশনী আপনার স্বপ্নকে বাস্তবে রূপ দিতে প্রস্তুত। আজই আপনার লেখা জমা দিন এবং একজন প্রকাশিত লেখক হিসেবে আত্মপ্রকাশ করুন।
                    </p>
                    <div className="space-y-4">
                      <Button 
                        onClick={() => user ? setStep(1) : signInWithPopup(auth, googleProvider)}
                        className="bg-white text-accent hover:bg-white/90 px-16 py-8 text-2xl rounded-full shadow-strong transition-transform"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        শুরু করুন
                      </Button>
                      <div className="pt-4">
                        <p className="text-white/40 text-sm font-medium uppercase tracking-widest">যেকোনো প্রয়োজনে যোগাযোগ করুন</p>
                        <a href="mailto:amadershomajprokashoni@gmail.com" className="text-white hover:text-white/80 transition-colors font-serif italic text-lg">amadershomajprokashoni@gmail.com</a>
                      </div>
                    </div>
                  </motion.div>
              </section>

            </motion.div>
            )}

            {step === 0 && currentView === 'author' && user && (
            <motion.div
              className="w-full max-w-6xl space-y-12"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
                <div className="space-y-2">
                  <h2 className="text-4xl font-serif font-bold">স্বাগতম, {userProfile?.displayName || user.displayName}!</h2>
                  <p className="text-ink/60 text-lg">আপনার লেখক ড্যাশবোর্ডে স্বাগতম। এখান থেকে আপনার সকল প্রকাশনা নিয়ন্ত্রণ করুন।</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <Button variant="primary" onClick={() => {
                    setEditingSubmissionId(null);
                    reset({
                      submissionType: "poem",
                      authorName: userProfile?.displayName || user.displayName || "",
                      authorBio: userProfile?.bio || "",
                      authorPhoto: userProfile?.photoURL || user.photoURL || "",
                      package: "2",
                      poems: [{ text: "" }, { text: "" }],
                    });
                    setStep(1);
                  }} className="px-8 py-4 text-base shadow-xl shadow-accent/20">
                    <Plus className="w-5 h-5" /> নতুন লেখা জমা দিন
                  </Button>
                  <Button variant="outline" onClick={() => {
                    setTempProfile({ ...userProfile });
                    setIsProfileModalOpen(true);
                  }} className="px-6 py-4 text-base">
                    <Settings className="w-5 h-5" /> প্রোফাইল
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-8">
                  {/* Profile Card */}
                  <Card className="p-8 space-y-8 bg-white border-black/5 shadow-2xl shadow-black/5">
                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="w-32 h-32 rounded-3xl bg-accent/5 p-1 border border-black/5 overflow-hidden">
                        {userProfile?.photoURL || user?.photoURL ? (
                          <img src={userProfile?.photoURL || user?.photoURL} alt="Profile" className="w-full h-full object-cover rounded-2xl" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-accent/10 rounded-2xl">
                            <User className="w-12 h-12 text-accent" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-serif font-bold text-xl">{userProfile?.displayName || user.displayName}</h3>
                        <p className="text-xs font-bold uppercase tracking-widest text-ink/40">নিবন্ধিত লেখক</p>
                      </div>
                      {userProfile?.bio && (
                        <p className="text-sm text-ink/60 line-clamp-3 italic">
                          "{userProfile.bio}"
                        </p>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-ink/40">
                        <span>প্রোফাইল পূর্ণতা</span>
                        <span>
                          {[
                            !!userProfile?.displayName,
                            !!userProfile?.bio,
                            !!(userProfile?.photoURL || user?.photoURL),
                            !!(userProfile?.facebook || userProfile?.twitter || userProfile?.instagram || userProfile?.website)
                          ].filter(Boolean).length * 25}%
                        </span>
                      </div>
                      <div className="h-2 bg-black/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${[
                            !!userProfile?.displayName,
                            !!userProfile?.bio,
                            !!(userProfile?.photoURL || user?.photoURL),
                            !!(userProfile?.facebook || userProfile?.twitter || userProfile?.instagram || userProfile?.website)
                          ].filter(Boolean).length * 25}%` }}
                          className="h-full bg-accent"
                        />
                      </div>
                      <p className="text-[10px] text-ink/40 leading-relaxed text-center italic">
                        প্রোফাইল ১০০% পূর্ণ করলে আপনার লেখা দ্রুত অনুমোদনের সম্ভাবনা বাড়ে।
                      </p>
                    </div>

                    <div className="flex justify-center gap-4 pt-4 border-t border-black/5">
                      {userProfile?.facebook && (
                        <a href={userProfile.facebook} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                          <Facebook className="w-5 h-5" />
                        </a>
                      )}
                      {userProfile?.twitter && (
                        <a href={userProfile.twitter} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center hover:bg-sky-500 hover:text-white transition-all">
                          <Twitter className="w-5 h-5" />
                        </a>
                      )}
                      {userProfile?.instagram && (
                        <a href={userProfile.instagram} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center hover:bg-pink-600 hover:text-white transition-all">
                          <Instagram className="w-5 h-5" />
                        </a>
                      )}
                      {userProfile?.website && (
                        <a href={userProfile.website} target="_blank" rel="noreferrer" className="w-10 h-10 rounded-xl bg-accent/5 text-accent flex items-center justify-center hover:bg-accent hover:text-white transition-all">
                          <Globe className="w-5 h-5" />
                        </a>
                      )}
                    </div>
                  </Card>

                  {/* Guidelines Card */}
                  <Card className="p-8 space-y-6 bg-paper border-none">
                    <h4 className="font-serif font-bold text-lg flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-accent" /> নির্দেশনাবলী
                    </h4>
                    <ul className="space-y-4 text-sm text-ink/60">
                      <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
                        কবিতা সর্বোচ্চ ৪০ লাইনের হতে হবে।
                      </li>
                      <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
                        গল্প ৮০০ থেকে ২০০০ শব্দের মধ্যে হতে হবে।
                      </li>
                      <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
                        অন্যের লেখা কপি করা সম্পূর্ণ নিষিদ্ধ।
                      </li>
                      <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
                        একবার সাবমিট করলে এডিট করা যাবে না।
                      </li>
                    </ul>
                  </Card>
                </div>

                {/* Main Content */}
                <div className="lg:col-span-3 space-y-8">
                  {/* Dashboard Tabs */}
                  <div className="flex border-b border-black/5 gap-12">
                    <button 
                      onClick={() => setActiveTab('overview')}
                      className={cn(
                        "pb-6 text-sm font-bold uppercase tracking-widest transition-all relative",
                        activeTab === 'overview' ? "text-accent" : "text-ink/40 hover:text-ink/60"
                      )}
                    >
                      ওভারভিউ
                      {activeTab === 'overview' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
                    </button>
                    <button 
                      onClick={() => setActiveTab('drafts')}
                      className={cn(
                        "pb-6 text-sm font-bold uppercase tracking-widest transition-all relative",
                        activeTab === 'drafts' ? "text-accent" : "text-ink/40 hover:text-ink/60"
                      )}
                    >
                      ড্রাফটস
                      {activeTab === 'drafts' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
                    </button>
                    <button 
                      onClick={() => setActiveTab('certificates')}
                      className={cn(
                        "pb-6 text-sm font-bold uppercase tracking-widest transition-all relative",
                        activeTab === 'certificates' ? "text-accent" : "text-ink/40 hover:text-ink/60"
                      )}
                    >
                      সার্টিফিকেটসমূহ
                      {activeTab === 'certificates' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-1 bg-accent rounded-t-full" />}
                    </button>
                  </div>

                  {activeTab === 'overview' ? (
                    <div className="space-y-12">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <Card className="p-8 bg-white border-black/5 shadow-xl shadow-black/5 flex items-center gap-6 group hover:bg-accent hover:text-white transition-all duration-500">
                          <div className="w-16 h-16 bg-accent/5 rounded-2xl flex items-center justify-center text-accent group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <BookOpen className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest opacity-40">মোট সাবমিশন</p>
                            <p className="text-3xl font-serif font-bold">{userSubmissions.length}</p>
                          </div>
                        </Card>
                        <Card className="p-8 bg-white border-black/5 shadow-xl shadow-black/5 flex items-center gap-6 group hover:bg-green-600 hover:text-white transition-all duration-500">
                          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <CheckCircle2 className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest opacity-40">অনুমোদিত</p>
                            <p className="text-3xl font-serif font-bold">{userSubmissions.filter(s => s.status === 'approved').length}</p>
                          </div>
                        </Card>
                        <Card className="p-8 bg-white border-black/5 shadow-xl shadow-black/5 flex items-center gap-6 group hover:bg-orange-500 hover:text-white transition-all duration-500">
                          <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 group-hover:bg-white/20 group-hover:text-white transition-colors">
                            <Clock className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-widest opacity-40">অপেক্ষমাণ</p>
                            <p className="text-3xl font-serif font-bold">{userSubmissions.filter(s => s.status === 'pending').length}</p>
                          </div>
                        </Card>
                      </div>

                        {/* Submissions List */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <h3 className="font-serif font-bold text-xl">আপনার জমা দেওয়া লেখা</h3>
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            {[...userSubmissions]
                              .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
                              .map((sub) => (
                              <div key={sub.id} className="bg-white p-6 rounded-3xl border border-black/5 flex flex-col items-stretch gap-6 hover:shadow-md transition-shadow">
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 bg-paper rounded-2xl flex items-center justify-center border border-black/5">
                                      {sub.submissionType === 'story' ? <BookOpen className="w-7 h-7 text-accent" /> : <PenTool className="w-7 h-7 text-accent" />}
                                    </div>
                                    <div className="text-left">
                                      <p className="font-bold text-lg">
                                        {sub.submissionType === 'story' ? 'গল্প সংকলন' : 'যৌথ কাব্যগ্রন্থ'}
                                      </p>
                                      <p className="text-sm text-ink/60">
                                        {sub.package}টি {sub.submissionType === 'story' ? 'গল্প' : 'কবিতা'}র প্যাকেজ
                                      </p>
                                      {sub.transactionId && (
                                        <p className="text-xs font-mono font-bold text-green-600 mt-1">
                                          TrxID: {sub.transactionId}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-3 w-full md:w-auto">
                                    {sub.status === 'pending' && (
                                      <Button variant="outline" onClick={() => handleEdit(sub)} className="flex-1 md:flex-none px-6 py-2 text-sm">
                                        এডিট করুন
                                      </Button>
                                    )}
                                    {sub.status === 'approved' && (
                                      <div className="flex gap-2 flex-1 md:flex-none">
                                        <Button 
                                          variant="primary" 
                                          onClick={() => setCertificateSubmission(sub)} 
                                          className="flex-1 px-4 py-2 text-sm shadow-lg shadow-accent/20"
                                        >
                                          <Award className="w-4 h-4" /> সার্টিফিকেট
                                        </Button>
                                        <Button 
                                          variant="outline" 
                                          onClick={() => {
                                            const text = `আমি "আমাদের সমাজ প্রকাশনী" থেকে আমার লেখার জন্য সম্মাননাপত্র পেয়েছি!`;
                                            const url = window.location.href;
                                            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank');
                                          }}
                                          className="px-3 py-2 text-blue-600 border-blue-100 hover:bg-blue-50"
                                        >
                                          <Share2 className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Submission Timeline */}
                                <div className="pt-6 border-t border-black/5">
                                  <div className="flex justify-between relative">
                                    <div className="absolute top-4 left-0 right-0 h-0.5 bg-black/5 -z-10" />
                                    {[
                                      { label: 'জমা দেওয়া হয়েছে', status: 'completed', icon: Plus },
                                      { label: 'যাচাই চলছে', status: sub.status === 'pending' ? 'active' : 'completed', icon: Clock },
                                      { label: sub.status === 'rejected' ? 'বাতিল' : 'অনুমোদিত', status: sub.status === 'pending' ? 'pending' : 'completed', icon: sub.status === 'rejected' ? XCircle : CheckCircle2 }
                                    ].map((item, idx) => (
                                      <div key={idx} className="flex flex-col items-center gap-2 bg-white px-2">
                                        <div className={cn(
                                          "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                                          item.status === 'completed' ? "bg-accent border-accent text-white" :
                                          item.status === 'active' ? "bg-white border-accent text-accent animate-pulse" :
                                          "bg-white border-black/10 text-ink/20"
                                        )}>
                                          <item.icon className="w-4 h-4" />
                                        </div>
                                        <span className={cn(
                                          "text-[10px] font-bold uppercase tracking-wider",
                                          item.status === 'completed' || item.status === 'active' ? "text-ink" : "text-ink/20"
                                        )}>
                                          {item.label}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {sub.adminFeedback && (
                                  <div className="mt-6 p-4 rounded-xl bg-orange-50 border border-orange-100">
                                    <p className="text-sm font-medium text-orange-800 mb-1">অ্যাডমিনের মতামত:</p>
                                    <p className="text-sm text-orange-700">{sub.adminFeedback}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                            {userSubmissions.length === 0 && (
                              <div className="text-center py-12 bg-paper rounded-[32px] border border-dashed border-black/10">
                                <p className="text-ink/40 italic">আপনি এখনো কিছু জমা দেননি।</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Submission Guide */}
                        <div className="pt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                          <div className="md:col-span-2 space-y-6">
                            <h3 className="font-serif font-bold text-xl">লেখা জমার নির্দেশিকা</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {[
                                { title: "মৌলিকতা", desc: "আপনার লেখা অবশ্যই মৌলিক হতে হবে। অন্য কারো লেখা কপি করা দণ্ডনীয় অপরাধ।" },
                                { title: "কবিতা ও গল্প", desc: "কবিতার ক্ষেত্রে ২/৪/১০টি এবং গল্পের ক্ষেত্রে ১/২/৩টি জমা দিতে পারবেন।" },
                                { title: "থিম", desc: "প্রেম, বিরহ, বিদ্রোহ, স্মৃতি, আত্মজিজ্ঞাসা—আপনার অনুভূতির প্রকাশই আমাদের প্রত্যাশা।" },
                                { title: "প্রকাশনা", desc: "বইটি Amazon, Google সহ ১৫০+ আন্তর্জাতিক প্ল্যাটফর্মে প্রকাশিত হবে।" }
                              ].map((guide, idx) => (
                                <div key={idx} className="p-5 bg-white rounded-2xl border border-black/5 flex gap-4">
                                  <div className="w-10 h-10 bg-accent/5 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-accent font-bold">{idx + 1}</span>
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-sm">{guide.title}</h4>
                                    <p className="text-xs text-ink/60 mt-1">{guide.desc}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-6">
                            <h3 className="font-serif font-bold text-xl">সাম্প্রতিক ঘোষণা</h3>
                            <div className="space-y-4">
                              {[
                                { date: "৩০ মার্চ", text: "যৌথ কাব্যগ্রন্থ ২০২৬-এর জন্য লেখক আহ্বান শুরু হয়েছে। শেষ তারিখ শীঘ্রই জানানো হবে।" },
                                { date: "১৫ মার্চ", text: "আমাদের বই এখন Amazon ও Google Books সহ ১৫০+ প্ল্যাটফর্মে পাওয়া যাচ্ছে।" }
                              ].map((news, idx) => (
                                <div key={idx} className="p-4 bg-paper rounded-2xl border border-black/5 space-y-1">
                                  <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{news.date}</span>
                                  <p className="text-xs font-medium leading-relaxed">{news.text}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : activeTab === 'drafts' ? (
                      <div className="space-y-6">
                        <div className="flex justify-between items-center">
                          <h3 className="font-serif font-bold text-xl">আপনার ড্রাফটসমূহ</h3>
                          <p className="text-sm text-ink/40">{userSubmissions.filter(s => s.status === 'draft').length}টি ড্রাফট সংরক্ষিত</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          {userSubmissions.filter(s => s.status === 'draft').map((draft) => (
                            <div key={draft.id} className="bg-white p-6 rounded-3xl border border-black/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                              <div className="flex items-center gap-4">
                                <div className="w-14 h-14 bg-paper rounded-2xl flex items-center justify-center border border-black/5">
                                  {draft.submissionType === 'story' ? <BookOpen className="w-7 h-7 text-accent" /> : <PenTool className="w-7 h-7 text-accent" />}
                                </div>
                                <div className="text-left">
                                  <p className="font-bold text-lg">
                                    {draft.submissionType === 'story' ? 'গল্প সংকলন (ড্রাফট)' : 'যৌথ কাব্যগ্রন্থ (ড্রাফট)'}
                                  </p>
                                  <p className="text-sm text-ink/60">
                                    {draft.package}টি {draft.submissionType === 'story' ? 'গল্প' : 'কবিতা'}র প্যাকেজ
                                  </p>
                                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-1">অসম্পূর্ণ</p>
                                </div>
                              </div>
                              <div className="flex gap-3 w-full md:w-auto">
                                <Button 
                                  variant="primary" 
                                  onClick={() => handleEdit(draft)} 
                                  className="flex-1 md:flex-none px-8 py-2 text-sm shadow-lg shadow-accent/20"
                                >
                                  এডিট ও সাবমিট
                                </Button>
                                <Button 
                                  variant="outline" 
                                  onClick={async () => {
                                    if (confirm('আপনি কি নিশ্চিতভাবে এই ড্রাফটটি মুছে ফেলতে চান?')) {
                                      try {
                                        await deleteDoc(doc(db, 'submissions', draft.id));
                                        toast.success('ড্রাফটটি মুছে ফেলা হয়েছে');
                                      } catch (error) {
                                        handleFirestoreError(error, OperationType.DELETE, `submissions/${draft.id}`);
                                      }
                                    }
                                  }} 
                                  className="px-3 py-2 text-red-500 border-red-100 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          {userSubmissions.filter(s => s.status === 'draft').length === 0 && (
                            <div className="text-center py-20 bg-paper rounded-[32px] border border-dashed border-black/10">
                              <FileText className="w-12 h-12 text-ink/10 mx-auto mb-4" />
                              <p className="text-ink/40 italic">আপনার কোন ড্রাফট নেই।</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {userSubmissions.filter(s => s.status === 'approved').map((sub) => (
                          <Card key={sub.id} className="p-8 space-y-6 hover:shadow-xl transition-all group cursor-pointer" onClick={() => setCertificateSubmission(sub)}>
                            <div className="w-full aspect-[1.414/1] bg-[#FDFBF7] border-4 border-double border-[#8B4513] p-4 flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden">
                              <div className="absolute inset-0 opacity-5 pointer-events-none">
                                <Globe className="w-full h-full" />
                              </div>
                              <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white text-[4px] font-bold border border-green-600">
                                <span className="leading-tight">আমাদের সমাজ<br/>প্রকাশনী</span>
                              </div>
                              <h5 className="text-[8px] font-serif font-bold text-[#8B4513]">সম্মাননাপত্র</h5>
                              <p className="text-[10px] font-serif font-bold text-ink">{sub.authorName}</p>
                              <p className="text-[6px] text-ink/60">"{sub.submissionType === 'story' ? 'গল্পের আসর' : 'কবিতার মিছিলে'}"</p>
                            </div>
                            <div className="flex justify-between items-center">
                              <div>
                                <h4 className="font-bold">{sub.submissionType === 'story' ? 'গল্পের আসর' : 'কবিতার মিছিলে'}</h4>
                                <p className="text-xs text-ink/60">অংশগ্রহণ সার্টিফিকেট</p>
                              </div>
                              <Button variant="ghost" className="p-2">
                                <Download className="w-5 h-5" />
                              </Button>
                            </div>
                          </Card>
                        ))}
                        {userSubmissions.filter(s => s.status === 'approved').length === 0 && (
                          <div className="col-span-full text-center py-20 bg-paper rounded-[32px] border border-dashed border-black/10">
                            <Award className="w-12 h-12 text-ink/10 mx-auto mb-4" />
                            <p className="text-ink/40 italic">আপনার লেখা অনুমোদিত হলে এখানে সার্টিফিকেট পাবেন।</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

          {step === 1 && (
            <motion.div 
              key="type"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-serif font-bold">কি জমা দিতে চান?</h2>
                <p className="text-ink/60">কবিতা অথবা গল্প নির্বাচন করুন</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {[
                  { id: "poem", icon: PenTool, label: "কবিতা", desc: "আপনার মৌলিক কবিতা জমা দিন" },
                  { id: "story", icon: BookOpen, label: "গল্প", desc: "আপনার মৌলিক ছোটগল্প জমা দিন" }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      setValue("submissionType", type.id as "poem" | "story");
                      // Reset package and poems based on type
                      if (type.id === "story") {
                        setValue("package", "1");
                        setValue("poems", [{ text: "" }]);
                      } else {
                        setValue("package", "2");
                        setValue("poems", [{ text: "" }, { text: "" }]);
                      }
                      setStep(2);
                    }}
                    className={cn(
                      "group relative text-left p-8 rounded-[32px] border-2 transition-all duration-300 bg-white",
                      selectedType === type.id ? "border-accent ring-4 ring-accent/10" : "border-black/5 hover:border-accent/30"
                    )}
                  >
                    <type.icon className="w-10 h-10 text-accent mb-4" />
                    <h3 className="font-serif font-bold text-2xl mb-2">{type.label}</h3>
                    <p className="text-sm text-ink/60">{type.desc}</p>
                  </button>
                ))}
              </div>
              
              <div className="flex justify-center">
                <button onClick={() => setStep(0)} className="text-ink/40 hover:text-ink flex items-center gap-2 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> ফিরে যান
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div 
              key="package"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-serif font-bold">প্যাকেজ নির্বাচন করুন</h2>
                <p className="text-ink/60">আপনার পছন্দমতো {selectedType === 'story' ? 'গল্প' : 'কবিতা'} সংখ্যা নির্বাচন করুন</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(selectedType === 'story' ? [
                  { id: "1", price: "১০০০", label: "১টি গল্প" },
                  { id: "2", price: "১৮০০", label: "২টি গল্প", premium: true },
                  { id: "3", price: "২৫০০", label: "৩টি গল্প", premium: true }
                ] : [
                  { id: "2", price: "৫০০", label: "২টি কবিতা" },
                  { id: "4", price: "৯০০", label: "৪টি কবিতা" },
                  { id: "10", price: "৪০০০", label: "১০টি কবিতা", premium: true, mega: true }
                ]).map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => {
                      setValue("package", pkg.id as "1" | "2" | "3" | "4" | "10", { shouldValidate: true });
                      // Update poems array length
                      const count = parseInt(pkg.id);
                      const currentPoems = watch("poems");
                      if (currentPoems.length < count) {
                        for (let i = currentPoems.length; i < count; i++) {
                          append({ text: "" });
                        }
                      } else if (currentPoems.length > count) {
                        for (let i = currentPoems.length; i > count; i--) {
                          remove(i - 1);
                        }
                      }
                      setStep(3);
                    }}
                    className={cn(
                      "group relative text-left p-8 rounded-[32px] border-2 transition-all duration-300",
                      (pkg as any).mega ? "bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-500/30 hover:border-blue-500 shadow-xl shadow-blue-500/10 transform hover:-translate-y-2 scale-105 z-10" :
                      (pkg as any).premium ? "bg-gradient-to-br from-orange-50 to-orange-100/50 border-accent/30 hover:border-accent shadow-xl shadow-accent/10 transform hover:-translate-y-1" : "bg-white border-black/5 hover:border-accent/30",
                      selectedPackage === pkg.id ? ((pkg as any).mega ? "border-blue-500 ring-4 ring-blue-500/10" : "border-accent ring-4 ring-accent/10") : ""
                    )}
                  >
                    {(pkg as any).mega ? (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-blue-400 text-white px-6 py-1.5 rounded-full text-xs font-bold tracking-wider shadow-md flex items-center gap-1.5 whitespace-nowrap animate-pulse">
                        <Award className="w-3.5 h-3.5 fill-current" /> মেগা অফার
                      </div>
                    ) : (pkg as any).premium && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-accent to-orange-600 text-white px-6 py-1.5 rounded-full text-xs font-bold tracking-wider shadow-md flex items-center gap-1.5 whitespace-nowrap">
                        <Star className="w-3.5 h-3.5 fill-current" /> প্রিমিয়াম প্যাকেজ
                      </div>
                    )}
                    <div className="space-y-4">
                      <span className={cn("font-serif italic text-lg", (pkg as any).mega ? "text-blue-600 font-bold" : (pkg as any).premium ? "text-accent font-bold" : "text-accent")}>{pkg.label}</span>
                      <div className="flex items-baseline gap-1">
                        <span className={cn("text-4xl font-bold", (pkg as any).mega ? "text-blue-600" : (pkg as any).premium ? "text-accent" : "")}>৳{pkg.price}</span>
                        <span className="text-ink/40 text-sm">মাত্র</span>
                      </div>
                      <ul className="space-y-2 text-sm text-ink/60">
                        <li className="flex items-center gap-2"><CheckCircle2 className={cn("w-4 h-4", (pkg as any).mega ? "text-blue-500" : "text-accent")} /> প্রিন্টেড বই</li>
                        {(pkg as any).premium && (
                          <li className={cn("flex items-center gap-2 font-medium", (pkg as any).mega ? "text-blue-600" : "text-accent")}><CheckCircle2 className={cn("w-4 h-4", (pkg as any).mega ? "text-blue-500" : "text-accent")} /> লেখক সম্মাননা ক্রেস্ট</li>
                        )}
                        <li className="flex items-center gap-2"><CheckCircle2 className={cn("w-4 h-4", (pkg as any).mega ? "text-blue-500" : "text-accent")} /> লেখক সার্টিফিকেট</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className={cn("w-4 h-4", (pkg as any).mega ? "text-blue-500" : "text-accent")} /> অনলাইন প্রচারণা</li>
                        {(pkg as any).premium && (
                          <li className={cn("flex items-center gap-2 font-medium", (pkg as any).mega ? "text-blue-600" : "text-accent")}><CheckCircle2 className={cn("w-4 h-4", (pkg as any).mega ? "text-blue-500" : "text-accent")} /> ভিআইপি সাপোর্ট</li>
                        )}
                        {(pkg as any).mega && (
                          <li className="flex items-center gap-2 font-bold text-blue-600"><CheckCircle2 className="w-4 h-4 text-blue-500" /> বিশেষ উপহার</li>
                        )}
                      </ul>
                    </div>
                  </button>
                ))}
              </div>

              {selectedType === 'story' && (
                <div className="mt-8 p-6 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-4">
                  <div className="p-3 bg-blue-100 rounded-full text-blue-600 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-blue-900 mb-1">গল্পের নিয়মাবলী</h4>
                    <ul className="text-sm text-blue-800 space-y-2">
                      <li>• প্রতিটি গল্পের শব্দ সীমা ৮০০ থেকে ২০০০ শব্দের মধ্যে হতে হবে।</li>
                      <li>• Plagiarism check (কপিরাইট যাচাই) বাধ্যতামূলক। অন্য কোথাও প্রকাশিত বা কপি করা লেখা গ্রহণযোগ্য নয়।</li>
                    </ul>
                  </div>
                </div>
              )}

              {selectedType === 'poem' && (
                <div className="mt-8 p-6 bg-purple-50 border border-purple-100 rounded-2xl flex items-start gap-4">
                  <div className="p-3 bg-purple-100 rounded-full text-purple-600 shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-purple-900 mb-1">কবিতার নিয়মাবলী</h4>
                    <ul className="text-sm text-purple-800 space-y-2">
                      <li>• প্রতিটি কবিতা সর্বোচ্চ ৪০ লাইনের মধ্যে হতে হবে।</li>
                      <li>• Plagiarism check (কপিরাইট যাচাই) বাধ্যতামূলক। অন্য কোথাও প্রকাশিত বা কপি করা লেখা গ্রহণযোগ্য নয়।</li>
                    </ul>
                  </div>
                </div>
              )}
              
              <div className="flex justify-center">
                <button onClick={() => setStep(1)} className="text-ink/40 hover:text-ink flex items-center gap-2 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> ফিরে যান
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-md mx-auto space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-serif font-bold">পেমেন্ট করুন</h2>
                <p className="text-ink/60">বিকাশ নম্বর 01959678229 এ টাকা সেন্ড মানি করে ট্রানজেকশন আইডি দিন</p>
              </div>

              <Card className="space-y-6">
                <div className="bg-accent/5 p-4 rounded-2xl border border-accent/10 text-center space-y-2">
                  <p className="text-sm font-medium text-ink/60">বিকাশ পার্সোনাল নম্বর</p>
                  <p className="text-2xl font-bold font-mono tracking-wider text-accent">01959678229</p>
                  <p className="text-sm text-ink/60">পরিমাণ: ৳{
                    selectedType === 'story' 
                      ? (selectedPackage === '1' ? '১০০০' : selectedPackage === '2' ? '১৮০০' : '২৫০০')
                      : (selectedPackage === '2' ? '৫০০' : selectedPackage === '4' ? '৯০০' : '৪০০০')
                  }</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-ink/60">ট্রানজেকশন আইডি (TrxID)</label>
                  <input 
                    {...register("transactionId")}
                    className={cn(
                      "w-full px-6 py-4 rounded-full border transition-all outline-none focus:ring-2 font-mono uppercase",
                      errors.transactionId ? "border-red-500 focus:ring-red-500/10" : "border-black/10 focus:border-accent focus:ring-accent/10"
                    )}
                    placeholder="8N7A6B5C4D"
                  />
                  {errors.transactionId && <p className="text-red-500 text-xs mt-1">{errors.transactionId.message}</p>}
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">পিছনে</Button>
                  <Button 
                    onClick={() => setStep(4)} 
                    className="flex-1"
                    disabled={!!errors.transactionId || !watch("transactionId") || watch("transactionId").length < 8}
                  >
                    পরবর্তী ধাপ
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div 
              key="info"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-serif font-bold">{selectedType === 'story' ? 'গল্পকার' : 'কবি'} পরিচিতি</h2>
                <p className="text-ink/60">আপনার সম্পর্কে কিছু তথ্য দিন</p>
              </div>

              <Card className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold uppercase tracking-wider text-ink/60 flex items-center gap-2">
                      <User className="w-4 h-4" /> আপনার নাম
                    </label>
                    {watch("authorName") && !errors.authorName && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  </div>
                  <input 
                    {...register("authorName")}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border transition-all outline-none focus:ring-2",
                      errors.authorName 
                        ? "border-red-500 focus:ring-red-500/10" 
                        : watch("authorName") 
                          ? "border-green-500 focus:ring-green-500/10" 
                          : "border-black/10 focus:border-accent focus:ring-accent/10"
                    )}
                    placeholder="যেমন: কাজী নজরুল ইসলাম"
                  />
                  {errors.authorName && <p className="text-red-500 text-xs mt-1">{errors.authorName.message}</p>}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold uppercase tracking-wider text-ink/60 flex items-center gap-2">
                      <PenTool className="w-4 h-4" /> সংক্ষিপ্ত পরিচিতি
                    </label>
                    <span className={cn(
                      "text-xs",
                      (watch("authorBio")?.length || 0) < 10 ? "text-ink/40" : "text-green-500"
                    )}>
                      {watch("authorBio")?.length || 0} অক্ষর
                    </span>
                  </div>
                  <textarea 
                    {...register("authorBio")}
                    rows={4}
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border transition-all outline-none focus:ring-2 resize-none",
                      errors.authorBio 
                        ? "border-red-500 focus:ring-red-500/10" 
                        : (watch("authorBio")?.length || 0) >= 10 
                          ? "border-green-500 focus:ring-green-500/10" 
                          : "border-black/10 focus:border-accent focus:ring-accent/10"
                    )}
                    placeholder="আপনার সাহিত্য চর্চা ও অর্জন সম্পর্কে লিখুন..."
                  />
                  {errors.authorBio && <p className="text-red-500 text-xs mt-1">{errors.authorBio.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold uppercase tracking-wider text-ink/60 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> ছবি (ঐচ্ছিক)
                  </label>
                  <label className="block">
                    <div className={cn(
                      "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer group relative overflow-hidden",
                      watch("authorPhoto") ? "border-accent bg-accent/5" : "border-black/10 hover:border-accent/30"
                    )}>
                      {watch("authorPhoto") ? (
                        <div className="space-y-2">
                          <img src={watch("authorPhoto")} alt="Preview" className="w-20 h-20 mx-auto rounded-full object-cover border-2 border-accent" />
                          <p className="text-xs text-accent font-medium">ছবি পরিবর্তন করুন</p>
                        </div>
                      ) : (
                        <>
                          <Plus className="w-8 h-8 mx-auto text-ink/20 group-hover:text-accent transition-colors" />
                          <p className="text-sm text-ink/40 mt-2">ছবি আপলোড করুন (JPEG/PNG)</p>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setValue("authorPhoto", reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                  </label>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button variant="outline" onClick={() => setStep(3)} className="flex-1">পিছনে</Button>
                  <Button 
                    onClick={() => setStep(5)} 
                    className="flex-1"
                    disabled={!!errors.authorName || !!errors.authorBio || !watch("authorName") || !watch("authorBio")}
                  >
                    পরবর্তী ধাপ
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div 
              key="poems"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-serif font-bold">{selectedType === 'story' ? 'গল্প' : 'কবিতা'} জমা দিন</h2>
                <p className="text-ink/60">আপনি {selectedPackage}টি {selectedType === 'story' ? 'গল্প' : 'কবিতা'} জমা দেওয়ার প্যাকেজ নিয়েছেন</p>
              </div>

              {!user ? (
                <Card className="text-center space-y-6 max-w-md mx-auto">
                  <p className="text-ink/60">{selectedType === 'story' ? 'গল্প' : 'কবিতা'} জমা দেওয়ার জন্য আপনাকে লগইন করতে হবে</p>
                  <Button onClick={handleSignIn} className="w-full">
                    <LogIn className="w-5 h-5" /> গুগল দিয়ে লগইন করুন
                  </Button>
                </Card>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                  <div className="grid grid-cols-1 gap-8">
                    {fields.map((field, index) => (
                      <Card key={field.id} className="relative group">
                        <div className="absolute -top-4 -left-4 w-10 h-10 bg-accent text-white rounded-full flex items-center justify-center font-serif font-bold shadow-lg">
                          {index + 1}
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-semibold uppercase tracking-wider text-ink/60">{selectedType === 'story' ? 'গল্প' : 'কবিতা'} {index + 1}</label>
                            <span className={cn(
                              "text-xs",
                              selectedType === 'story'
                                ? ((watch(`poems.${index}.text`)?.trim().split(/\s+/).filter(w => w.length > 0).length || 0) >= 800 && (watch(`poems.${index}.text`)?.trim().split(/\s+/).filter(w => w.length > 0).length || 0) <= 2000 ? "text-green-500" : "text-red-500")
                                : ((watch(`poems.${index}.text`)?.length || 0) < 20 ? "text-ink/40" : "text-green-500")
                            )}>
                              {selectedType === 'story' 
                                ? `${watch(`poems.${index}.text`)?.trim().split(/\s+/).filter(w => w.length > 0).length || 0} শব্দ (৮০০-২০০০)`
                                : `${watch(`poems.${index}.text`)?.length || 0} অক্ষর`
                              }
                            </span>
                          </div>
                          <textarea 
                            {...register(`poems.${index}.text` as const)}
                            rows={selectedType === 'story' ? 12 : 8}
                            className={cn(
                              "w-full px-6 py-4 rounded-2xl border transition-all outline-none focus:ring-2 font-serif leading-relaxed text-lg",
                              errors.poems?.[index]?.text 
                                ? "border-red-500 focus:ring-red-500/10" 
                                : (watch(`poems.${index}.text`)?.length || 0) >= 20 
                                  ? "border-green-500 focus:ring-green-500/10" 
                                  : "border-black/10 focus:border-accent focus:ring-accent/10"
                            )}
                            placeholder={selectedType === 'story' ? "এখানে আপনার গল্পটি লিখুন..." : "এখানে আপনার কবিতাটি লিখুন..."}
                          />
                          {errors.poems?.[index]?.text && <p className="text-red-500 text-xs mt-1">{errors.poems[index]?.text?.message}</p>}
                        </div>
                      </Card>
                    ))}
                  </div>

                  {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center text-sm">
                      {error}
                    </div>
                  )}

                  {selectedType === 'story' && (
                    <div className="space-y-2 max-w-2xl mx-auto">
                      <div className="flex items-start gap-3 bg-orange-50 p-4 rounded-xl border border-orange-200">
                        <input 
                          type="checkbox" 
                          id="plagiarismChecked" 
                          {...register("plagiarismChecked")}
                          className="mt-1 w-5 h-5 text-accent rounded border-orange-300 focus:ring-accent"
                        />
                        <label htmlFor="plagiarismChecked" className="text-sm font-medium text-orange-900 leading-relaxed">
                          আমি নিশ্চিত করছি যে এই গল্পটি সম্পূর্ণ আমার নিজের লেখা এবং অন্য কোথাও প্রকাশিত হয়নি (Plagiarism Check)। অন্য কারো লেখা কপি করা হলে প্রকাশনী কর্তৃপক্ষ যেকোনো ব্যবস্থা নিতে পারবে।
                        </label>
                      </div>
                      {errors.plagiarismChecked && <p className="text-red-500 text-xs mt-1 px-2">{errors.plagiarismChecked.message}</p>}
                    </div>
                  )}

                  <div className="flex flex-col gap-4 max-w-md mx-auto">
                    <div className="flex gap-4">
                      <Button variant="outline" type="button" onClick={() => setStep(4)} className="flex-1">পিছনে</Button>
                      <Button 
                        type="button"
                        variant="outline"
                        onClick={handleSubmit((data) => onSubmit(data, true))}
                        disabled={isSubmitting}
                        className="flex-1 border-accent text-accent hover:bg-accent/5"
                      >
                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "ড্রাফট সেভ করুন"}
                      </Button>
                    </div>
                    <Button 
                      type="submit" 
                      disabled={isSubmitting || !isValid} 
                      className="w-full"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "জমা দিন"}
                    </Button>
                  </div>
                </form>
              )}
            </motion.div>
          )}

          {step === 6 && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-8 max-w-xl mx-auto"
            >
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600">
                <CheckCircle2 className="w-12 h-12" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl font-serif font-bold">অভিনন্দন!</h2>
                <p className="text-xl text-ink/70 leading-relaxed">
                  আপনার {selectedType === 'story' ? 'গল্প' : 'কবিতা'}গুলো সফলভাবে জমা হয়েছে। আমাদের সম্পাদক মন্ডলী এগুলো যাচাই করে আপনার সাথে শীঘ্রই যোগাযোগ করবেন।
                </p>
              </div>
              <Card className="bg-accent/5 border-accent/10">
                <p className="text-sm text-ink/60">
                  বইটি প্রকাশের আপডেট পেতে আমাদের ফেসবুক পেজে যুক্ত থাকুন। <br />
                  <span className="font-bold text-accent mt-2 block">#আমাদের_সমাজ_প্রকাশনী</span>
                </p>
              </Card>
              <Button onClick={() => setStep(0)} variant="outline">হোম পেজে ফিরে যান</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )}
  </main>
      {/* Certificate Modal */}
      <AnimatePresence>
        {certificateSubmission && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-4 rounded-2xl max-w-4xl w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setCertificateSubmission(null)}
                className="absolute top-4 right-4 p-2 hover:bg-black/5 rounded-full transition-colors print:hidden"
              >
                <X className="w-6 h-6" />
              </button>

              <div id="certificate-content" className="certificate-container p-8 border-[12px] border-double border-[#8B4513] bg-[#FDFBF7] relative overflow-hidden">
                {/* Ornate corners (CSS) */}
                <div className="absolute top-0 left-0 w-24 h-24 border-t-4 border-l-4 border-[#8B4513] rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-24 h-24 border-t-4 border-r-4 border-[#8B4513] rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-24 h-24 border-b-4 border-l-4 border-[#8B4513] rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-24 h-24 border-b-4 border-r-4 border-[#8B4513] rounded-br-lg"></div>

                <div className="text-center space-y-6 py-12">
                  <div className="flex justify-center mb-4">
                    <div className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center text-white font-bold border-4 border-green-600">
                      <span className="text-[10px] leading-tight">আমাদের সমাজ<br/>প্রকাশনী</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-lg font-serif font-bold text-[#1a1a1a]">আমাদের সমাজ প্রকাশনী</h4>
                    <p className="text-xs text-ink/60">{certificateSubmission.submissionType === 'story' ? 'গল্প সংকলন: গল্পের আসর' : 'যৌথ কাব্যগ্রন্থ ২০২৬'}</p>
                  </div>

                  <div className="py-4">
                    <h2 className="text-5xl font-serif font-black text-[#8B4513] tracking-widest uppercase">সম্মাননাপত্র</h2>
                  </div>

                  <div className="max-w-2xl mx-auto space-y-6 text-lg leading-relaxed text-ink/80">
                    <p>
                      অত্যন্ত আনন্দের সাথে জানানো যাচ্ছে যে, জনাব/জনাবা <br/>
                      <span className="text-3xl font-serif font-bold text-ink block my-4 underline decoration-double underline-offset-8 decoration-[#8B4513]">
                        {certificateSubmission.authorName}
                      </span>
                    </p>
                    <p>
                      আমাদের সমাজ প্রকাশনী কর্তৃক আয়োজিত {certificateSubmission.submissionType === 'story' ? 'গল্প সংকলন' : 'যৌথ কাব্যগ্রন্থ'} <span className="font-bold text-accent">"{certificateSubmission.submissionType === 'story' ? 'গল্পের আসর' : 'যৌথ কাব্যগ্রন্থ ২০২৬'}"</span> {certificateSubmission.submissionType === 'story' ? 'গল্প' : 'কবিতা'} জমা দিয়ে অংশগ্রহণ করায় তাকে এই সম্মাননাপত্র প্রদান করা হচ্ছে।
                    </p>
                    <p className="text-sm italic">
                      আমরা আপনার উত্তরোত্তর সাফল্য ও উজ্জ্বল ভবিষ্যৎ কামনা করি।
                    </p>
                  </div>

                  <div className="flex justify-between items-end pt-12 px-12">
                    <div className="text-left space-y-1">
                      <p className="text-sm border-t border-ink/20 pt-2">তারিখ: {new Date().toLocaleDateString('bn-BD')}</p>
                    </div>
                    <div className="text-center space-y-1">
                      <div className="w-32 h-12 border-b-2 border-ink/40 mb-2 flex items-center justify-center italic font-serif text-ink/40">Signature</div>
                      <p className="text-sm font-bold">সম্পাদক</p>
                      <p className="text-[10px] text-ink/60">আমাদের সমাজ প্রকাশনী</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 print:hidden">
                <Button variant="outline" onClick={() => setCertificateSubmission(null)}>বন্ধ করুন</Button>
                <Button 
                  variant="outline"
                  className="border-accent text-accent hover:bg-accent/5"
                  onClick={handleDownloadCertificate}
                >
                  <Download className="w-4 h-4 mr-2" /> ডাউনলোড করুন
                </Button>
                <Button 
                  variant="outline"
                  className="border-blue-500 text-blue-500 hover:bg-blue-50"
                  onClick={() => {
                    const text = `আমি "আমাদের সমাজ প্রকাশনী" থেকে আমার লেখার জন্য সম্মাননাপত্র পেয়েছি!`;
                    const url = window.location.href;
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank');
                  }}
                >
                  <Share2 className="w-4 h-4 mr-2" /> শেয়ার করুন
                </Button>
                <Button 
                  className="bg-accent text-white"
                  onClick={() => window.print()}
                >
                  <Printer className="w-4 h-4 mr-2" /> প্রিন্ট করুন
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {feedbackModal.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white p-8 rounded-[32px] max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setFeedbackModal({ ...feedbackModal, isOpen: false })}
                className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-serif font-bold">মতামত দিন</h3>
                  <p className="text-sm text-ink/60">লেখকের জন্য কোনো মন্তব্য থাকলে এখানে লিখুন</p>
                </div>

                <div className="space-y-4">
                  <textarea 
                    rows={4}
                    value={feedbackModal.currentFeedback}
                    placeholder="আপনার মতামত..."
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-accent outline-none transition-all"
                    onChange={(e) => setFeedbackModal({ ...feedbackModal, currentFeedback: e.target.value })}
                  />
                </div>

                <Button 
                  className="w-full"
                  onClick={async () => {
                    await handleUpdateStatus(feedbackModal.submissionId, feedbackModal.status, feedbackModal.currentFeedback);
                    setFeedbackModal({ isOpen: false, submissionId: '', status: '', currentFeedback: '' });
                  }}
                >
                  নিশ্চিত করুন
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Profile Modal */}
      <AnimatePresence>
        {isProfileModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white p-8 rounded-[32px] max-w-md w-full shadow-2xl relative"
            >
              <button 
                onClick={() => setIsProfileModalOpen(false)}
                className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-24 h-24 mx-auto mb-4 relative group">
                    <div className="w-full h-full rounded-full overflow-hidden border-4 border-accent/20">
                      {tempProfile?.photoURL || user?.photoURL ? (
                        <img src={tempProfile?.photoURL || user?.photoURL} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-accent/10 flex items-center justify-center">
                          <User className="w-10 h-10 text-accent" />
                        </div>
                      )}
                    </div>
                    <label className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <Camera className="w-6 h-6 text-white mb-1" />
                      <span className="text-[10px] text-white font-bold uppercase tracking-wider">পরিবর্তন</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const img = new Image();
                              img.src = reader.result as string;
                              img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const MAX_WIDTH = 400;
                                const MAX_HEIGHT = 400;
                                let width = img.width;
                                let height = img.height;

                                if (width > height) {
                                  if (width > MAX_WIDTH) {
                                    height *= MAX_WIDTH / width;
                                    width = MAX_WIDTH;
                                  }
                                } else {
                                  if (height > MAX_HEIGHT) {
                                    width *= MAX_HEIGHT / height;
                                    height = MAX_HEIGHT;
                                  }
                                }

                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                ctx?.drawImage(img, 0, 0, width, height);
                                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                                setTempProfile({ ...tempProfile, photoURL: dataUrl });
                              };
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {tempProfile?.photoURL && (
                    <button 
                      onClick={() => setTempProfile({ ...tempProfile, photoURL: "" })}
                      className="text-xs text-red-500 hover:text-red-600 font-medium"
                    >
                      ছবি মুছে ফেলুন
                    </button>
                  )}
                  <h3 className="text-2xl font-serif font-bold">প্রোফাইল সেটিংস</h3>
                  <p className="text-sm text-ink/60">আপনার লেখক তথ্য আপডেট করুন</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-ink/40">লেখকের নাম</label>
                    <input 
                      type="text"
                      value={tempProfile?.displayName || ""}
                      placeholder="আপনার নাম"
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-accent outline-none transition-all"
                      onChange={(e) => setTempProfile({ ...tempProfile, displayName: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-ink/40">ফেসবুক লিঙ্ক</label>
                      <input 
                        type="text"
                        value={tempProfile?.facebook || ""}
                        placeholder="https://facebook.com/..."
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-accent outline-none transition-all"
                        onChange={(e) => setTempProfile({ ...tempProfile, facebook: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-ink/40">টুইটার লিঙ্ক</label>
                      <input 
                        type="text"
                        value={tempProfile?.twitter || ""}
                        placeholder="https://twitter.com/..."
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-accent outline-none transition-all"
                        onChange={(e) => setTempProfile({ ...tempProfile, twitter: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-ink/40">ইনস্টাগ্রাম লিঙ্ক</label>
                      <input 
                        type="text"
                        value={tempProfile?.instagram || ""}
                        placeholder="https://instagram.com/..."
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-accent outline-none transition-all"
                        onChange={(e) => setTempProfile({ ...tempProfile, instagram: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-ink/40">ওয়েবসাইট (ঐচ্ছিক)</label>
                      <input 
                        type="text"
                        value={tempProfile?.website || ""}
                        placeholder="https://..."
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-accent outline-none transition-all"
                        onChange={(e) => setTempProfile({ ...tempProfile, website: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-ink/40">লেখক পরিচিতি</label>
                    <div className="relative">
                      <textarea 
                        rows={4}
                        maxLength={200}
                        value={tempProfile?.bio || ""}
                        placeholder="আপনার সম্পর্কে কিছু লিখুন..."
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:border-accent outline-none transition-all resize-none"
                        onChange={(e) => setTempProfile({ ...tempProfile, bio: e.target.value })}
                      />
                      <div className="absolute bottom-3 right-3 text-[10px] font-bold text-ink/20">
                        {(tempProfile?.bio || "").length}/২০০
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  className="w-full"
                  disabled={isSavingProfile}
                  onClick={async () => {
                    if (!user) return;
                    setIsSavingProfile(true);
                    try {
                      await updateDoc(doc(db, "profiles", user.uid), {
                        displayName: tempProfile.displayName || "",
                        bio: tempProfile.bio || "",
                        photoURL: tempProfile.photoURL || "",
                        facebook: formatUrl(tempProfile.facebook || ""),
                        twitter: formatUrl(tempProfile.twitter || ""),
                        instagram: formatUrl(tempProfile.instagram || ""),
                        website: formatUrl(tempProfile.website || ""),
                        updatedAt: serverTimestamp()
                      });
                      toast.success("প্রোফাইল সফলভাবে আপডেট করা হয়েছে");
                      setIsProfileModalOpen(false);
                    } catch (err) {
                      console.error("Error updating profile:", err);
                      toast.error("প্রোফাইল আপডেট করতে সমস্যা হয়েছে");
                    } finally {
                      setIsSavingProfile(false);
                    }
                  }}
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      সংরক্ষণ করা হচ্ছে...
                    </>
                  ) : "সংরক্ষণ করুন"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

  {/* Footer */}
      <footer className="bg-white border-t border-black/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white font-bold text-sm">
              আ
            </div>
            <h2 className="text-xl font-serif font-bold">আমাদের সমাজ প্রকাশনী</h2>
          </div>
          <div className="flex flex-col items-center md:items-end gap-2">
            <p className="text-sm text-ink/40 italic">© ২০২৬ আমাদের সমাজ প্রকাশনী। সর্বস্বত্ব সংরক্ষিত।</p>
            <a href="mailto:amadershomajprokashoni@gmail.com" className="text-xs text-accent hover:underline font-medium">amadershomajprokashoni@gmail.com</a>
          </div>
          <div className="flex gap-6">
            {[Facebook, Twitter, Instagram].map((Icon, i) => (
              <a key={i} href="#" className="text-ink/40 hover:text-accent transition-colors">
                <Icon className="w-5 h-5" />
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  </ErrorBoundary>
);
}
