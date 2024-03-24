import { useEffect, useState } from "react";
import {
  Web3AuthMPCCoreKit,
  WEB3AUTH_NETWORK,
  Point,
  AggregateVerifierLoginParams,
  TssShareType,
  keyToMnemonic,
  getWebBrowserFactor,
  COREKIT_STATUS,
  TssSecurityQuestion,
  generateFactorKey,
} from "@web3auth/mpc-core-kit";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import Web3 from "web3";
import type { provider } from "web3-core";

import "./App.css";
import { SafeEventEmitterProvider } from "@web3auth/base";
import { BN } from "bn.js";

const uiConsole = (...args: any[]): void => {
  const el = document.querySelector("#console>p");
  if (el) {
    el.innerHTML = JSON.stringify(args || {}, null, 2);
  }
  console.log(...args);
};

const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: "0xaa36a7",
  displayName: "Ethereum Sepolia",
  tickerName: "Ethereum Sepolia",
  ticker: "ETH",
  rpcTarget: "https://rpc.ankr.com/eth_sepolia",
  blockExplorer: "https://sepolia.etherscan.io",
};

const selectedNetwork = WEB3AUTH_NETWORK.MAINNET;

const coreKitInstance = new Web3AuthMPCCoreKit({
  web3AuthClientId: "BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiAZOTEBtTXw4tsluTITPqA8zMsfxIKMjiqNQ",
  web3AuthNetwork: selectedNetwork,
  uxMode: "popup",
  chainConfig,
});

function App() {
  const [backupFactorKey, setBackupFactorKey] = useState<string | undefined>(undefined);
  const [provider, setProvider] = useState<SafeEventEmitterProvider | null>(null);
  const [web3, setWeb3] = useState<any>(undefined);
  const [exportTssShareType, setExportTssShareType] = useState<TssShareType>(TssShareType.DEVICE);
  const [factorPubToDelete, setFactorPubToDelete] = useState<string>("");
  const [coreKitStatus, setCoreKitStatus] = useState<COREKIT_STATUS>(COREKIT_STATUS.NOT_INITIALIZED);
  const [answer, setAnswer] = useState<string | undefined>(undefined);
  const [newAnswer, setNewAnswer] = useState<string | undefined>(undefined);
  const [question, setQuestion] = useState<string | undefined>(undefined);
  const [newQuestion, setNewQuestion] = useState<string | undefined>(undefined);
  const [currentWalletIndex, setCurrentWalletIndex] = useState<number>(0);

  const securityQuestion: TssSecurityQuestion = new TssSecurityQuestion();

  useEffect(() => {
    const init = async () => {
      await coreKitInstance.init();

      if (coreKitInstance.provider) {
        setProvider(coreKitInstance.provider);
      }

      setCoreKitStatus(coreKitInstance.status);
    };
    init();
  }, []);

  useEffect(() => {
    if(coreKitInstance.status === COREKIT_STATUS.LOGGED_IN) {
      const userInfo = coreKitInstance?.getUserInfo();
      if (userInfo) {
        const email = userInfo.email;
        const loginMethod = userInfo.typeOfLogin;
        const storageKey = generateStorageKey(email, loginMethod);
        const storedIndex = localStorage.getItem(storageKey);
        if (storedIndex) {
          setCurrentWalletIndex(parseInt(storedIndex));
          setTSSWalletIndex(parseInt(storedIndex));
        }
      }
    }
  }, [coreKitInstance]);

  useEffect(() => {
    if (provider) {
      const web3 = new Web3(provider as provider);
      setWeb3(web3);
    }
  }, [provider]);

  const keyDetails = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    uiConsole(coreKitInstance.getKeyDetails());
  };

  const listFactors = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    const factorPubs = coreKitInstance.tKey.metadata.factorPubs;
    if (!factorPubs) {
      throw new Error("factorPubs not found");
    }
    const pubsHex = factorPubs[coreKitInstance.tKey.tssTag].map((pub: any) => {
      return Point.fromTkeyPoint(pub).toBufferSEC1(true).toString("hex");
    });
    uiConsole(pubsHex);
  };

  // Generate a unique storage key based on the user's email and login method
  const generateStorageKey = (email: string, loginMethod: string) => {
    return `walletIndex_${loginMethod}_${email}`;
  };

  const login = async () => {
    try {
      if (!coreKitInstance) {
        throw new Error("initiated to login");
      }
      const verifierConfig = {
        aggregateVerifierIdentifier: "aggregate-sapphire",
        subVerifierDetailsArray: [
          {
            typeOfLogin: "google",
            verifier: "w3a-google",
            clientId: "519228911939-cri01h55lsjbsia1k7ll6qpalrus75ps.apps.googleusercontent.com",
          },
        ],
      } as AggregateVerifierLoginParams;

      await coreKitInstance.loginWithOauth(verifierConfig);

      try {
        let result = securityQuestion.getQuestion(coreKitInstance!);
        setQuestion(result);
      } catch (e) {
        setQuestion(undefined);
        uiConsole(e);
      }

      if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
        uiConsole(
          "required more shares, please enter your backup/ device factor key, or reset account unrecoverable once reset, please use it with caution]"
        );
      }

      if (coreKitInstance.provider) {
        setProvider(coreKitInstance.provider);
      }

      setCoreKitStatus(coreKitInstance.status);

      const userInfo = coreKitInstance.getUserInfo();
      if (userInfo) {
        const { email, typeOfLogin } = userInfo;
        updateWalletIndexFromStorage(email, typeOfLogin);
      }
    } catch (error: unknown) {
      uiConsole(error);
    }
  };

  const getDeviceShare = async () => {
    const factorKey = await getWebBrowserFactor(coreKitInstance!);
    setBackupFactorKey(factorKey);
    uiConsole("Device share: ", factorKey);
  };

  const updateWalletIndexFromStorage = (email: string, loginMethod: string) => {
    const storageKey = generateStorageKey(email, loginMethod);
    const storedIndex = localStorage.getItem(storageKey);
    if (storedIndex) {
      const index = parseInt(storedIndex);
      setTSSWalletIndex(index);
      setCurrentWalletIndex(index);
    }
    else{
      setTSSWalletIndex(currentWalletIndex);
    }
  };

  const inputBackupFactorKey = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!backupFactorKey) {
      throw new Error("backupFactorKey not found");
    }
    const factorKey = new BN(backupFactorKey, "hex");
    await coreKitInstance.inputFactorKey(factorKey);

    if (coreKitInstance.status === COREKIT_STATUS.REQUIRED_SHARE) {
      uiConsole(
        "required more shares even after inputing backup factor key, please enter your backup/ device factor key, or reset account [unrecoverable once reset, please use it with caution]"
      );
    }

    if (coreKitInstance.provider) {
      setProvider(coreKitInstance.provider);
    }
  };

  const recoverSecurityQuestionFactor = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    if (!answer) {
      throw new Error("backupFactorKey not found");
    }

    let factorKey = await securityQuestion.recoverFactor(coreKitInstance, answer);
    setBackupFactorKey(factorKey);
    uiConsole("Security Question share: ", factorKey);
  };

  const logout = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance not found");
    }
    await coreKitInstance.logout();
    uiConsole("Log out");
    setProvider(null);
  };

  const getUserInfo = (): void => {
    const user = coreKitInstance?.getUserInfo();
    uiConsole(user);
  };

  const exportFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    uiConsole("export share type: ", exportTssShareType);
    const factorKey = generateFactorKey();
    await coreKitInstance.createFactor({
      shareType: exportTssShareType,
      factorKey: factorKey.private,
    });
    uiConsole("Export factor key: ", factorKey);
  };

  const deleteFactor = async (): Promise<void> => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    const pubBuffer = Buffer.from(factorPubToDelete, "hex");
    const pub = Point.fromBufferSEC1(pubBuffer);
    await coreKitInstance.deleteFactor(pub.toTkeyPoint());
    const userInfo = coreKitInstance.getUserInfo();
    if (userInfo) {
      const { email, typeOfLogin } = userInfo;
      updateWalletIndexFromStorage(email, typeOfLogin);
    }
    uiConsole("factor deleted");
  };

  const getChainID = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const chainId = await web3.eth.getChainId();
    uiConsole(chainId);
    return chainId;
  };

  const getAccounts = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const address = (await web3.eth.getAccounts())[0];
    uiConsole(address);
    return address;
  };

  const getBalance = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const address = (await web3.eth.getAccounts())[0];
    const balance = web3.utils.fromWei(
      await web3.eth.getBalance(address) // Balance is in wei
    );
    uiConsole(balance);
    return balance;
  };

  const signMessage = async (): Promise<any> => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const fromAddress = (await web3.eth.getAccounts())[0];
    const originalMessage = [
      {
        type: "string",
        name: "fullName",
        value: "Satoshi Nakamoto",
      },
      {
        type: "uint32",
        name: "userId",
        value: "1212",
      },
    ];
    const params = [originalMessage, fromAddress];
    const method = "eth_signTypedData";
    const signedMessage = await (web3.currentProvider as any)?.sendAsync({
      id: 1,
      method,
      params,
      fromAddress,
    });
    uiConsole(signedMessage);
  };

  const criticalResetAccount = async (): Promise<void> => {
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
    uiConsole("reset");
    setProvider(null);
  };

  const sendTransaction = async () => {
    if (!web3) {
      uiConsole("web3 not initialized yet");
      return;
    }
    const fromAddress = (await web3.eth.getAccounts())[0];

    const destination = "0x7DF1fEf832b57E46dE2E1541951289C04B2781Aa";
    const amount = web3.utils.toWei("0.001"); // Convert 1 ether to wei

    // Submit transaction to the blockchain and wait for it to be mined
    uiConsole("Sending transaction...");
    const receipt = await web3.eth.sendTransaction({
      from: fromAddress,
      to: destination,
      value: amount,
    });
    uiConsole(receipt);
  };

  const createSecurityQuestion = async (question: string, answer: string) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.setSecurityQuestion({ mpcCoreKit: coreKitInstance, question, answer, shareType: TssShareType.RECOVERY });
    setNewQuestion(undefined);
    let result = await securityQuestion.getQuestion(coreKitInstance);
    if (result) {
      setQuestion(question);
    }
    const userInfo = coreKitInstance.getUserInfo();
    if (userInfo) {
      const { email, typeOfLogin } = userInfo;
      updateWalletIndexFromStorage(email, typeOfLogin);
    }
  };

  const changeSecurityQuestion = async (newQuestion: string, newAnswer: string, answer: string) => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.changeSecurityQuestion({ mpcCoreKit: coreKitInstance, newQuestion, newAnswer, answer });
    let result = await securityQuestion.getQuestion(coreKitInstance);
    if (result) {
      setQuestion(question);
    }
    const userInfo = coreKitInstance.getUserInfo();
    if (userInfo) {
      const { email, typeOfLogin } = userInfo;
      updateWalletIndexFromStorage(email, typeOfLogin);
    }
  };

  const deleteSecurityQuestion = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    await securityQuestion.deleteSecurityQuestion(coreKitInstance);
    setQuestion(undefined);
    const userInfo = coreKitInstance.getUserInfo();
    if (userInfo) {
      const { email, typeOfLogin } = userInfo;
      updateWalletIndexFromStorage(email, typeOfLogin);
    }
  };

  const enableMFA = async () => {
    if (!coreKitInstance) {
      throw new Error("coreKitInstance is not set");
    }
    const factorKey = await coreKitInstance.enableMFA({});
    const factorKeyMnemonic = keyToMnemonic(factorKey);
    const userInfo = coreKitInstance.getUserInfo();
    if (userInfo) {
      const { email, typeOfLogin } = userInfo;
      updateWalletIndexFromStorage(email, typeOfLogin);
    }

    uiConsole("MFA enabled, device factor stored in local store, deleted hashed cloud key, your backup factor key: ", factorKeyMnemonic);
  };

  const setTSSWalletIndex = async (index = 0) => {
    await coreKitInstance.setTssWalletIndex(index);
    const userInfo = coreKitInstance?.getUserInfo();
    if (userInfo) {
      const email = userInfo.email;
      const loginMethod = userInfo.typeOfLogin;
      const storageKey = generateStorageKey(email, loginMethod);
      localStorage.setItem(storageKey, index.toString());
    }
    // Update state and ensure UI is in sync
    setCurrentWalletIndex(index);
    // Log new account details
    await getAccounts();
  };

  const loggedInView = (
    <>
      <h2 className="subtitle">Account Details</h2>
      <div className="flex-container">
        <button onClick={getUserInfo} className="card">
          Get User Info
        </button>

        <button onClick={async () => uiConsole(await coreKitInstance.getTssPublicKey())} className="card">
          Get Public Key
        </button>

        <button onClick={keyDetails} className="card">
          Key Details
        </button>

        <button onClick={listFactors} className="card">
          List Factors
        </button>
      </div>
      <div className="flex-container">
        <button onClick={criticalResetAccount} className="card">
          [CRITICAL] Reset Account
        </button>

        <button onClick={async () => uiConsole(await coreKitInstance._UNSAFE_exportTssKey())} className="card">
          [CAUTION] Export TSS Private Key
        </button>

        <button onClick={logout} className="card">
          Log Out
        </button>
      </div>
      <h2 className="subtitle">Multi Account</h2>
      <div className="flex-container">
        <button onClick={() => setTSSWalletIndex(1)} className="card">
          Switch to wallet index: 1
        </button>
        <button onClick={() => setTSSWalletIndex(2)} className="card">
          Switch to wallet index: 2
        </button>
        <button onClick={() => setTSSWalletIndex(0)} className="card">
          Switch to wallet index: 0/default
        </button>
      </div>
      <h2 className="subtitle">Recovery/ Key Manipulation</h2>
      <div>
        <h4>Enabling MFA</h4>
        <div className="flex-container">
          <button onClick={enableMFA} className="card">
            Enable MFA
          </button>
        </div>
        <h4>Manual Factors Manipulation</h4>
        <div className="flex-container">
          <label>Share Type:</label>
          <select value={exportTssShareType} onChange={(e) => setExportTssShareType(parseInt(e.target.value))}>
            <option value={TssShareType.DEVICE}>Device Share</option>
            <option value={TssShareType.RECOVERY}>Recovery Share</option>
          </select>
          <button onClick={exportFactor} className="card">
            Export share
          </button>
        </div>
        <div className="flex-container">
          <label>Factor pub:</label>
          <input value={factorPubToDelete} onChange={(e) => setFactorPubToDelete(e.target.value)}></input>
          <button onClick={deleteFactor} className="card">
            Delete Factor
          </button>
        </div>
        <div className="flex-container">
          <input value={backupFactorKey} onChange={(e) => setBackupFactorKey(e.target.value)}></input>
          <button onClick={() => inputBackupFactorKey()} className="card">
            Input Factor Key
          </button>
        </div>

        <h4>Security Question</h4>

        <div>{question}</div>
        <div className="flex-container">
          <div className={question ? " disabledDiv" : ""}>
            <label>Set Security Question:</label>
            <input value={question} placeholder="question" onChange={(e) => setNewQuestion(e.target.value)}></input>
            <input value={answer} placeholder="answer" onChange={(e) => setAnswer(e.target.value)}></input>
            <button onClick={() => createSecurityQuestion(newQuestion!, answer!)} className="card">
              Create Security Question
            </button>
          </div>

          <div className={!question ? " disabledDiv" : ""}>
            <label>Change Security Question:</label>
            <input value={newQuestion} placeholder="newQuestion" onChange={(e) => setNewQuestion(e.target.value)}></input>
            <input value={newAnswer} placeholder="newAnswer" onChange={(e) => setNewAnswer(e.target.value)}></input>
            <input value={answer} placeholder="oldAnswer" onChange={(e) => setAnswer(e.target.value)}></input>
            <button onClick={() => changeSecurityQuestion(newQuestion!, newAnswer!, answer!)} className="card">
              Change Security Question
            </button>
          </div>
        </div>
        <div className="flex-container">
          <div className={!question ? "disabledDiv" : ""}>
            <button onClick={() => deleteSecurityQuestion()} className="card">
              Delete Security Question
            </button>
          </div>
        </div>
      </div>
      <h2 className="subtitle">Blockchain Calls</h2>
      <div className="flex-container">
        <button onClick={getChainID} className="card">
          Get Chain ID
        </button>

        <button onClick={getAccounts} className="card">
          Get Accounts
        </button>

        <button onClick={getBalance} className="card">
          Get Balance
        </button>

        <button onClick={signMessage} className="card">
          Sign Message
        </button>

        <button onClick={sendTransaction} className="card">
          Send Transaction
        </button>
      </div>
    </>
  );

  const unloggedInView = (
    <>
      <button onClick={() => login()} className="card">
        Login
      </button>
      <div className={coreKitStatus === COREKIT_STATUS.REQUIRED_SHARE ? "" : "disabledDiv"}>
        <button onClick={() => getDeviceShare()} className="card">
          Get Device Share
        </button>
        <label>Backup/ Device factor key:</label>
        <input value={backupFactorKey} onChange={(e) => setBackupFactorKey(e.target.value)}></input>
        <button onClick={() => inputBackupFactorKey()} className="card">
          Input Factor Key
        </button>
        <button onClick={criticalResetAccount} className="card">
          [CRITICAL] Reset Account
        </button>

        <div className={!question ? "disabledDiv" : ""}>
          <label>Recover Using Security Answer:</label>
          <label>{question}</label>
          <input value={answer} onChange={(e) => setAnswer(e.target.value)}></input>
          <button onClick={() => recoverSecurityQuestionFactor()} className="card">
            Recover Using Security Answer
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="container">
      <h1 className="title">
        <a target="_blank" href="https://web3auth.io/docs/sdk/core-kit/mpc-core-kit/" rel="noreferrer">
          Web3Auth MPC Core Kit
        </a>{" "}
        Popup Aggregate Flow Example
      </h1>

      <div className="grid">{provider ? loggedInView : unloggedInView}</div>
      <div id="console" style={{ whiteSpace: "pre-line" }}>
        <p style={{ whiteSpace: "pre-line" }}></p>
      </div>

      <footer className="footer">
        <a
          href="https://github.com/Web3Auth/web3auth-core-kit-examples/tree/main/mpc-core-kit-web/mpc-core-kit-aggregate-verifier-example"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source code
        </a>
      </footer>
    </div>
  );
}

export default App;
