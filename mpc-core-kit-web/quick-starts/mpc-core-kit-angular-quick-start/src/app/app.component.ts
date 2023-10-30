import { Component } from "@angular/core";
import { Web3AuthMPCCoreKit, WEB3AUTH_NETWORK, IdTokenLoginParams, TssShareType, parseToken, getWebBrowserFactor, generateFactorKey, COREKIT_STATUS, keyToMnemonic, mnemonicToKey } from "@web3auth/mpc-core-kit";
import Web3 from "web3";
import { BN } from "bn.js";

// Firebase libraries for custom authentication
import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, signInWithPopup, UserCredential } from "firebase/auth";

const verifier = "w3a-firebase-demo";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB0nd9YsPLu-tpdCrsXn8wgsWVAiYEpQ_E",
  authDomain: "web3auth-oauth-logins.firebaseapp.com",
  projectId: "web3auth-oauth-logins",
  storageBucket: "web3auth-oauth-logins.appspot.com",
  messagingSenderId: "461819774167",
  appId: "1:461819774167:web:e74addfb6cc88f3b5b9c92",
};

const coreKitInstance = new Web3AuthMPCCoreKit(
  {
    web3AuthClientId: 'BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiAZOTEBtTXw4tsluTITPqA8zMsfxIKMjiqNQ',
    web3AuthNetwork: WEB3AUTH_NETWORK.MAINNET,
  }
);

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent {
  title = "Web3Auth tKey Angular Quick Start";
  coreKitStatus: COREKIT_STATUS = COREKIT_STATUS.NOT_INITIALIZED;
  backupFactorKey: string = "";
  mnemonicFactor: string = "";

  getBackupFactorKeyInputEvent(event: any) {
    this.backupFactorKey = event.target.value;
  }
  getMnemonicFactorInputEvent(event: any) {
    this.mnemonicFactor = event.target.value;
  }

  app = initializeApp(firebaseConfig);

  async ngOnInit() {
    const init = async () => {
      try {
        await coreKitInstance.init();

        this.coreKitStatus = coreKitInstance.status;
      } catch (error) {
        console.error(error);
      }
    };

    init();
  }

  signInWithGoogle = async (): Promise<UserCredential> => {
    try {
      const auth = getAuth(this.app);
      const googleProvider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, googleProvider);
      console.log(res);
      return res;
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  login = async () => {
    try {
      if (!coreKitInstance) {
        throw new Error('initiated to login');
      }
      const loginRes = await this.signInWithGoogle();
      const idToken = await loginRes.user.getIdToken(true);
      const parsedToken = parseToken(idToken);

      const idTokenLoginParams = {
        verifier,
        verifierId: parsedToken.sub,
        idToken,
      } as IdTokenLoginParams;

      await coreKitInstance.loginWithJWT(idTokenLoginParams);

      if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
        this.uiConsole("required more shares, please enter your backup/ device factor key, or reset account [unrecoverable once reset, please use it with caution]"); 
      }

      this.coreKitStatus = coreKitInstance.status;
    }
    catch (err) {
      this.uiConsole(err);
    }
  };
  
  inputBackupFactorKey = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!this.backupFactorKey) {
      throw new Error("backupFactorKey not found");
    }
    const factorKey = new BN(this.backupFactorKey, "hex")
    await coreKitInstance.inputFactorKey(factorKey);

    this.coreKitStatus = coreKitInstance.status;

    if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
      this.uiConsole("required more shares even after inputing backup factor key, please enter your backup/ device factor key, or reset account [unrecoverable once reset, please use it with caution]");
    }
  };

  enableMFA = async () => { 
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    const factorKey = await coreKitInstance.enableMFA({});
    const factorKeyMnemonic = keyToMnemonic(factorKey);

    this.uiConsole("MFA enabled, device factor stored in local store, deleted hashed cloud key, your backup factor key: ", factorKeyMnemonic);
  };

  keyDetails = async () => {
    if (!coreKitInstance) {
      throw new Error('coreKitInstance not found');
    }
    this.uiConsole(coreKitInstance.getKeyDetails());
  };

  getDeviceFactor = async () => {
    try {
      const factorKey = await getWebBrowserFactor(coreKitInstance!);
      this.backupFactorKey = factorKey!;
      this.uiConsole("Device share: ", factorKey);
    } catch (e) {
      this.uiConsole(e);
    }
  };

  exportMnemonicFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    this.uiConsole("export share type: ", TssShareType.RECOVERY);
    const factorKey = generateFactorKey();
    await coreKitInstance.createFactor({
      shareType: TssShareType.RECOVERY,
      factorKey: factorKey.private
    });
    const factorKeyMnemonic = await keyToMnemonic(factorKey.private.toString("hex"));
    this.uiConsole("Export factor key mnemonic: ", factorKeyMnemonic);
  };

  MnemonicToFactorKeyHex = async (mnemonic: string) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    try {
      const factorKey = await mnemonicToKey(mnemonic);
      this.backupFactorKey = factorKey;
      return factorKey;
    } catch (error) {
      this.uiConsole(error);
      return null
    }
  }; 

  getUserInfo = async () => {
    this.uiConsole(coreKitInstance.getUserInfo());
  };
  
  logout = async () => {
    await coreKitInstance.logout();
    this.coreKitStatus = coreKitInstance.status;
    this.uiConsole("logged out");
  };

  getAccounts = async () => {
    if (!coreKitInstance) {
      this.uiConsole("provider not initialized yet");
      return;
    }
    const web3 = new Web3(coreKitInstance.provider as any);

    // Get user's Ethereum public address
    const address = await web3.eth.getAccounts();
    this.uiConsole(address);
  };

  getBalance = async () => {
    if (!coreKitInstance) {
      this.uiConsole("provider not initialized yet");
      return;
    }
    const web3 = new Web3(coreKitInstance.provider as any);

    // Get user's Ethereum public address
    const address = (await web3.eth.getAccounts())[0];

    // Get user's balance in ether
    const balance = web3.utils.fromWei(
      await web3.eth.getBalance(address), // Balance is in wei
      "ether"
    );
    this.uiConsole(balance);
  };

  signMessage = async () => {
    if (!coreKitInstance) {
      this.uiConsole("provider not initialized yet");
      return;
    }
    const web3 = new Web3(coreKitInstance.provider as any);

    // Get user's Ethereum public address
    const fromAddress = (await web3.eth.getAccounts())[0];

    const originalMessage = "YOUR_MESSAGE";

    // Sign the message
    const signedMessage = await web3.eth.personal.sign(
      originalMessage,
      fromAddress,
      "test password!" // configure your own password here.
    );
    this.uiConsole(signedMessage);
  };

  criticalResetAccount = async (): Promise<void> => {
    // This is a critical function that should only be used for testing purposes
    // Resetting your account means clearing all the metadata associated with it from the metadata server
    // The key details will be deleted from our server and you will not be able to recover your account
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    //@ts-ignore
    // if (selectedNetwork === WEB3AUTH_NETWORK.MAINNET) {
    //   throw new Error("reset account is not recommended on mainnet");
    // }
    await coreKitInstance.tKey.storageLayer.setMetadata({
      privKey: new BN(coreKitInstance.metadataKey!, "hex"),
      input: { message: "KEY_NOT_FOUND" },
    });
    this.uiConsole('reset');
    this.logout();
  }


  uiConsole(...args: any[]) {
    const el = document.querySelector("#console-ui>p");
    if (el) {
      el.innerHTML = JSON.stringify(args || {}, null, 2);
    }
  }
}
