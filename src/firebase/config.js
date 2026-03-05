import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const furnitureConfig = {
  apiKey: "AIzaSyBRKuz4FrEir6KNCwB92WB95FlHPmZGpK0",
  authDomain: "patelfurniture-prod.firebaseapp.com",
  databaseURL: "https://patelfurniture-prod-default-rtdb.firebaseio.com",
  projectId: "patelfurniture-prod",
  storageBucket: "patelfurniture-prod.firebasestorage.app",
  messagingSenderId: "983048067900",
  appId: "1:983048067900:web:654caacd4f2c5712335c39",
  measurementId: "G-HS12B60PZX"
};

const electronicsConfig = {
  apiKey: "AIzaSyCyzl-f-LUDQ_EqvXHoBLsAAFtpQbrUoQE",
  authDomain: "patel-enterprise-prod.firebaseapp.com",
  databaseURL: "https://patel-enterprise-prod-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "patel-enterprise-prod",
  storageBucket: "patel-enterprise-prod.firebasestorage.app",
  messagingSenderId: "270299091871",
  appId: "1:270299091871:web:73689787234c66a90663aa",
  measurementId: "G-9ZJMEBSJPD"
};

// Initialize both apps
export const furnitureApp = getApps().find(a => a.name === 'furniture') 
  || initializeApp(furnitureConfig, 'furniture');

export const electronicsApp = getApps().find(a => a.name === 'electronics') 
  || initializeApp(electronicsConfig, 'electronics');

export const furnitureAuth = getAuth(furnitureApp);
export const electronicsAuth = getAuth(electronicsApp);

export const furnitureDb = getFirestore(furnitureApp);
export const electronicsDb = getFirestore(electronicsApp);

export const getAppByStore = (storeType) => {
  return storeType === 'furniture' ? furnitureApp : electronicsApp;
};

export const getAuthByStore = (storeType) => {
  return storeType === 'furniture' ? furnitureAuth : electronicsAuth;
};

export const getDbByStore = (storeType) => {
  return storeType === 'furniture' ? furnitureDb : electronicsDb;
};
