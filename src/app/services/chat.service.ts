import { inject, Injectable } from '@angular/core';
import {
  Auth,
  authState,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  user,
  getAuth,
  User,
} from '@angular/fire/auth';
import {
  map,
  switchMap,
  firstValueFrom,
  filter,
  Observable,
  Subscription,
} from 'rxjs';
import {
  doc,
  docData,
  DocumentReference,
  Firestore,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  deleteDoc,
  collectionData,
  Timestamp,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  DocumentData,
  FieldValue,
} from '@angular/fire/firestore';
import {
  Storage,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from '@angular/fire/storage';
import { getToken, Messaging, onMessage } from '@angular/fire/messaging';
import { Router } from '@angular/router';

type ChatMessage = {
  name: string | null;
  profilePicUrl: string | null;
  timestamp: FieldValue;
  uid: string | null;
  text?: string;
  imageUrl?: string;
};

@Injectable({
  providedIn: 'root',
})
export class ChatService {
  firestore: Firestore = inject(Firestore);
  auth: Auth = inject(Auth);
  storage: Storage = inject(Storage);
  messaging: Messaging = inject(Messaging);
  router: Router = inject(Router);
  private provider = new GoogleAuthProvider();
  LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif?a';

  // observable that is updated when the auth state changes
  user$ = user(this.auth);
  currentUser: User | null = this.auth.currentUser;
  userSubscription: Subscription;

  constructor() {
    this.userSubscription = this.user$.subscribe((aUser: User | null) => {
      this.currentUser = aUser;
    });
  }

  // Login Friendly Chat.
  login() {
    signInWithPopup(this.auth, this.provider).then((result) => {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      this.router.navigate(['/', 'chat']);

      return credential;
    });
  }

  // Logout of Friendly Chat.
  logout() {
    signOut(this.auth)
      .then(() => {
        this.router.navigate(['/', 'login']);
        console.log('User signed out');
      })
      .catch((error) => {
        console.error('Sign Out Error', error);
      });
  }

  // Adds a text or image message to Cloud Firestore.
  addMessage = async (
    textMessage: string | null,
    imageUrl: string | null
  ): Promise<void | DocumentReference<DocumentData>> => {
    if (!textMessage && !imageUrl) {
      console.log('No message to add');

      return;
    }

    if (!this.currentUser) {
      console.log('You must be signed in to add a message');

      return;
    }

    const message: ChatMessage = {
      name: this.currentUser.displayName,
      profilePicUrl: this.currentUser.photoURL,
      timestamp: serverTimestamp(),
      uid: this.currentUser.uid,
    };

    textMessage && (message.text = textMessage);
    imageUrl && (message.imageUrl = imageUrl);

    try {
      const newMessageRef = await addDoc(
        collection(this.firestore, 'messages'),
        message
      );

      return newMessageRef;
    } catch (error) {
      console.log('Error adding message', error);
      return;
    }
  };

  // Saves a new message to Cloud Firestore.
  saveTextMessage = async (messageText: string) => {
    return this.addMessage(messageText, null);
  };

  // Loads chat messages history and listens for upcoming ones.
  loadMessages = () => {
    const recentMessagesQuery = query(
      collection(this.firestore, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(12)
    );

    return collectionData(recentMessagesQuery);
  };

  // Saves a new message containing an image in Firebase.
  // This first saves the image in Firebase storage.
  saveImageMessage = async (file: any) => {
    try {
      const messageRef = await this.addMessage(null, this.LOADING_IMAGE_URL);
      const filePath = `${this.auth.currentUser?.uid}/${file.name}`;
      const newImageRef = ref(this.storage, filePath);
      const fileSnapshot = await uploadBytesResumable(newImageRef, file);
      const publicImageUrl = await getDownloadURL(newImageRef);

      if (messageRef) {
        await updateDoc(messageRef, {
          imageUrl: publicImageUrl,
          storageUri: fileSnapshot.metadata.fullPath,
        });
      }
    } catch (error) {
      console.error(
        'There was an error uploading a file to Cloud Storage:',
        error
      );
    }
  };

  async updateData(path: string, data: any) {}

  async deleteData(path: string) {}

  getDocData(path: string) {}

  getCollectionData(path: string) {}

  async uploadToStorage(
    path: string,
    input: HTMLInputElement,
    contentType: any
  ) {
    return null;
  }
  // Requests permissions to show notifications.
  requestNotificationsPermissions = async () => {
    console.log('Requesting notifications permission...');
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      console.log('Notification permission granted.');
      // Notification permission granted.
      await this.saveMessagingDeviceToken();
    } else {
      console.log('Unable to get permission to notify.');
    }
  };

  saveMessagingDeviceToken = async () => {
    try {
      const currentToken = await getToken(this.messaging);
      if (currentToken) {
        console.log('Got FCM device token:', currentToken);
        // Saving the Device Token to Cloud Firestore.
        const tokenRef = doc(this.firestore, 'fcmTokens', currentToken);
        await setDoc(tokenRef, { uid: this.auth.currentUser?.uid });

        // This will fire when a message is received while the app is in the foreground.
        // When the app is in the background, firebase-messaging-sw.js will receive the message instead.
        onMessage(this.messaging, (message) => {
          console.log(
            'New foreground notification from Firebase Messaging!',
            message.notification
          );
        });
      } else {
        // Need to request permissions to show notifications.
        this.requestNotificationsPermissions();
      }
    } catch (error) {
      console.error('Unable to get messaging token.', error);
    }
  };
}
