import React, {useEffect, useState} from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import {tKeyInstance, ethereumPrivateKeyProvider} from './tkey';
import RPC from './ethersRPC'; // for using ethers.js
import auth from '@react-native-firebase/auth';
// @ts-ignore
import {decode as atob} from 'base-64';
import {Dialog, Input} from '@rneui/themed';
import EncryptedStorage from 'react-native-encrypted-storage';
import BN from 'bn.js';

async function signInWithEmailPassword() {
  try {
    const res = await auth().signInWithEmailAndPassword(
      'custom+jwt@firebase.login',
      'Testing@123',
    );
    return res;
  } catch (error) {
    console.error(error);
  }
}

export default function App() {
  const [privateKey, setPrivateKey] = useState<string | null>();
  const [loading, setLoading] = useState<boolean>(false);
  const [oAuthShare, setOAuthShare] = useState<any>(null);
  const [tKeyPubX, setTKeyPubX] = useState<any>(null);
  const [userInfo, setUserInfo] = useState<string>('');
  const [consoleUI, setConsoleUI] = useState<string>('');
  const [recoveryPassword, setRecoveryPassword] = useState<string>('');
  const [recoveryModalVisibility, setRecoveryModalVisibility] =
    useState<boolean>(false);
  const [passwordShareModalVisibility, setPasswordShareModalVisibility] =
    useState<boolean>(false);
  const [
    changePasswordShareModalVisibility,
    setChangePasswordShareModalVisibility,
  ] = useState<boolean>(false);

  useEffect(() => {
    const init = async () => {
      // Initialization of Service Provider
      try {
        await (tKeyInstance.serviceProvider as any).init(
          ethereumPrivateKeyProvider,
        );
      } catch (error) {
        console.error(error);
      }
    };
    init();
  }, []);

  const parseToken = (token: any) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace('-', '+').replace('_', '/');
      return JSON.parse(atob(base64 || ''));
    } catch (err) {
      uiConsole(err);
      return null;
    }
  };

  const login = async () => {
    try {
      setConsoleUI('Logging in');
      setLoading(true);
      const loginRes = await signInWithEmailPassword();
      uiConsole('Login success', loginRes);
      const idToken = await loginRes!.user.getIdToken(true);
      uiConsole('idToken', idToken);
      const parsedToken = parseToken(idToken);
      setUserInfo(parsedToken);

      const verifier = 'web3auth-firebase-examples';
      const verifierId = parsedToken.sub;

      const loginResponse = await (tKeyInstance.serviceProvider as any).connect(
        {
          verifier,
          verifierId,
          idToken,
        },
      );

      const OAuthShareKey = await loginResponse.request({
        method: 'eth_private_key',
      });
      uiConsole('OAuthShareKey', OAuthShareKey);
      setOAuthShare(OAuthShareKey);

      await tKeyInstance.initialize();

      const deviceShare = await getDeviceShare();

      if (deviceShare && deviceShare.toString() !== '0') {
        try {
          await tKeyInstance.inputShare(deviceShare);
        } catch (error) {
          uiConsole(error);
        }
      }

      const {requiredShares} = tKeyInstance.getKeyDetails();

      uiConsole('requiredShares', requiredShares);

      if (requiredShares <= 0) {
        const reconstructedKey = await tKeyInstance.reconstructKey();
        const finalPrivateKey = reconstructedKey?.privKey.toString('hex');
        await setPrivateKey(finalPrivateKey);
        uiConsole('Private Key: ' + finalPrivateKey);

        const metadata = await tKeyInstance.getMetadata();
        const TKeyPubX = metadata.pubKey.x.toString(16, 64);
        setTKeyPubX(TKeyPubX);
        if (!deviceShare || deviceShare.toString() !== '0') {
          setDeviceShare();
        }
      } else {
        toggleRecoveryModalVisibility();
      }

      setLoading(false);
      uiConsole('Logged In');
    } catch (e) {
      uiConsole(e);
      setLoading(false);
    }
  };

  const recoverShare = async (password: string) => {
    if (!tKeyInstance) {
      uiConsole('tKeyInstance not initialized yet');
      return;
    }

    if (password.length > 10) {
      try {
        setLoading(true);
        await (
          tKeyInstance.modules.securityQuestions as any
        ).inputShareFromSecurityQuestions(password); // 2/2 flow
        const {requiredShares} = tKeyInstance.getKeyDetails();
        if (requiredShares <= 0) {
          const reconstructedKey = await tKeyInstance.reconstructKey();
          const finalPrivateKey = reconstructedKey?.privKey.toString('hex');
          await setPrivateKey(finalPrivateKey);
          uiConsole('Private Key: ' + finalPrivateKey);

          const metadata = await tKeyInstance.getMetadata();
          const TKeyPubX = metadata.pubKey.x.toString(16, 64);
          setTKeyPubX(TKeyPubX);
          setDeviceShare();
        }
        uiConsole('Successfully logged you in with the recovery password.');
      } catch (error) {
        uiConsole(error);
        setLoading(false);
      }
    } else {
      uiConsole('Error', 'Password must be >= 11 characters', 'error');
      setLoading(false);
    }
  };

  const setDeviceShare = async () => {
    try {
      const generateShareResult = await tKeyInstance.generateNewShare();
      const share = await tKeyInstance.outputShareStore(
        generateShareResult.newShareIndex,
      ).share.share;
      EncryptedStorage.setItem(
        `deviceShare${tKeyPubX}`,
        share.toString(16, 64),
      );
      uiConsole('Device Share Set', share.toString(16, 64));
    } catch (error) {
      uiConsole('Error', (error as any)?.message.toString(), 'error');
    }
  };

  const getDeviceShare = async () => {
    try {
      const shareHex = await EncryptedStorage.getItem(`deviceShare${tKeyPubX}`);
      const shareBN = new BN(shareHex as any, 'hex');
      uiConsole('Device Share Captured Successfully', shareBN);
      return shareBN;
    } catch (error) {
      uiConsole('Error', (error as any)?.message.toString(), 'error');
    }
  };

  const deleteDeviceShare = async () => {
    try {
      await EncryptedStorage.removeItem(`deviceShare${tKeyPubX}`);
      uiConsole('Device Share Deleted');
    } catch (error) {
      uiConsole('Error', (error as any)?.message.toString(), 'error');
    }
  };

  const changeSecurityQuestionAndAnswer = async (password: string) => {
    if (!tKeyInstance) {
      uiConsole('tKeyInstance not initialized yet');
      return;
    }

    if (password.length > 10) {
      try {
        setLoading(true);
        await (
          tKeyInstance.modules.securityQuestions as any
        ).changeSecurityQuestionAndAnswer(password, 'whats your password?');
        uiConsole('Successfully changed new share with password.');
      } catch (error) {
        uiConsole('Error', (error as any)?.message.toString(), 'error');
        setLoading(false);
      }
    } else {
      uiConsole('Error', 'Password must be >= 11 characters', 'error');
      setLoading(false);
    }

    const keyDetails = await tKeyInstance.getKeyDetails();
    uiConsole(keyDetails);
  };

  const generateNewShareWithPassword = async (password: string) => {
    if (!tKeyInstance) {
      uiConsole('tKeyInstance not initialized yet');
      return;
    }
    if (password.length > 10) {
      try {
        setLoading(true);
        await (
          tKeyInstance.modules.securityQuestions as any
        ).generateNewShareWithSecurityQuestions(
          password,
          'whats your password?',
        );
        uiConsole('Successfully generated new share with password.');
      } catch (error) {
        uiConsole('Error', (error as any)?.message.toString(), 'error');
        setLoading(false);
      }
    } else {
      uiConsole('Error', 'Password must be >= 11 characters', 'error');
      setLoading(false);
    }
  };

  const getKeyDetails = async () => {
    if (!tKeyInstance) {
      uiConsole('tKeyInstance not initialized yet');
      return;
    }

    setConsoleUI('Getting Key Details');
    uiConsole(await tKeyInstance.getKeyDetails());
  };

  const resetAccount = async () => {
    if (!tKeyInstance) {
      uiConsole('tKeyInstance not initialized yet');
      return;
    }
    try {
      uiConsole(oAuthShare);
      await tKeyInstance.storageLayer.setMetadata({
        privKey: oAuthShare as any,
        input: {message: 'KEY_NOT_FOUND'},
      });
      uiConsole('Reset Account Successful.');
    } catch (e) {
      uiConsole(e);
    }
  };

  const getChainId = async () => {
    setConsoleUI('Getting chain id');
    const networkDetails = await RPC.getChainId();
    uiConsole(networkDetails);
  };

  const getAccounts = async () => {
    setConsoleUI('Getting account');
    const address = await RPC.getAccounts(privateKey as string);
    uiConsole(address);
  };
  const getBalance = async () => {
    setConsoleUI('Fetching balance');
    const balance = await RPC.getBalance(privateKey as string);
    uiConsole(balance);
  };
  const sendTransaction = async () => {
    setConsoleUI('Sending transaction');
    const tx = await RPC.sendTransaction(privateKey as string);
    uiConsole(tx);
  };
  const signMessage = async () => {
    setConsoleUI('Signing message');
    const message = await RPC.signMessage(privateKey as string);
    uiConsole(message);
  };
  const logout = async () => {
    setPrivateKey(null);
    setOAuthShare(null);
    setUserInfo('');
  };

  const uiConsole = (...args: any) => {
    setConsoleUI(JSON.stringify(args || {}, null, 2) + '\n\n\n\n' + consoleUI);
    console.log(...args);
  };

  const toggleRecoveryModalVisibility = async () => {
    setRecoveryModalVisibility(!recoveryModalVisibility);
  };

  const recoveryModal = (
    <Dialog
      isVisible={recoveryModalVisibility}
      onBackdropPress={toggleRecoveryModalVisibility}>
      <Dialog.Title title="Enter Recovery Share" />
      <Input
        placeholder="Recovery Password"
        onChangeText={value => setRecoveryPassword(value)}
      />
      {loading && <ActivityIndicator />}
      <Button
        title="Submit"
        onPress={async () => {
          await recoverShare(recoveryPassword);
          toggleRecoveryModalVisibility();
          setLoading(false);
        }}
      />
    </Dialog>
  );

  const togglePasswordShareModalVisibility = async () => {
    setPasswordShareModalVisibility(!passwordShareModalVisibility);
  };

  const setPasswordShareModal = (
    <Dialog
      isVisible={passwordShareModalVisibility}
      onBackdropPress={togglePasswordShareModalVisibility}>
      <Dialog.Title title="Enter Recovery Share" />
      <Input
        placeholder="Recovery Password"
        onChangeText={value => setRecoveryPassword(value)}
      />
      {loading && <ActivityIndicator />}
      <Button
        title="Submit"
        onPress={async () => {
          await generateNewShareWithPassword(recoveryPassword);
          togglePasswordShareModalVisibility();
          setLoading(false);
        }}
      />
    </Dialog>
  );

  const toggleChangePasswordShareModalVisibility = async () => {
    setChangePasswordShareModalVisibility(!changePasswordShareModalVisibility);
  };

  const changePasswordShareModal = (
    <Dialog
      isVisible={changePasswordShareModalVisibility}
      onBackdropPress={toggleChangePasswordShareModalVisibility}>
      <Dialog.Title title="Enter Recovery Share" />
      <Input
        placeholder="Recovery Password"
        onChangeText={value => setRecoveryPassword(value)}
      />
      {loading && <ActivityIndicator />}
      <Button
        title="Submit"
        onPress={async () => {
          await changeSecurityQuestionAndAnswer(recoveryPassword);
          toggleChangePasswordShareModalVisibility();
          setLoading(false);
        }}
      />
    </Dialog>
  );

  const loggedInView = (
    <View style={styles.buttonArea}>
      {setPasswordShareModal}
      {changePasswordShareModal}
      <Button title="Get User Info" onPress={() => uiConsole(userInfo)} />
      <Button title="Get Key Details" onPress={() => getKeyDetails()} />
      <Button title="Get Chain ID" onPress={() => getChainId()} />
      <Button
        title="Set Password Share"
        onPress={() => togglePasswordShareModalVisibility()}
      />
      <Button
        title="Change Password Share"
        onPress={() => toggleChangePasswordShareModalVisibility()}
      />
      <Button title="Get Accounts" onPress={() => getAccounts()} />
      <Button title="Get Balance" onPress={() => getBalance()} />
      <Button title="Send Transaction" onPress={() => sendTransaction()} />
      <Button title="Sign Message" onPress={() => signMessage()} />
      <Button title="Get Private Key" onPress={() => uiConsole(privateKey)} />
      <Button title="Set Device Share" onPress={() => setDeviceShare()} />
      <Button title="Get Device Share" onPress={() => getDeviceShare()} />
      <Button title="Delete Device Share" onPress={() => deleteDeviceShare()} />
      <Button title="Reset Account" onPress={resetAccount} />
      <Button title="Log Out" onPress={logout} />
    </View>
  );

  const unloggedInView = (
    <View style={styles.buttonArea}>
      {recoveryModal}
      <Button title="Login with Web3Auth" onPress={login} />
      {loading && <ActivityIndicator />}
      <Button title="Reset Account" onPress={resetAccount} />
    </View>
  );

  return (
    <View style={styles.container}>
      {privateKey ? loggedInView : unloggedInView}
      <View style={styles.consoleArea}>
        <Text style={styles.consoleText}>Console:</Text>
        <ScrollView style={styles.consoleUI}>
          <Text>{consoleUI}</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
    paddingBottom: 30,
  },
  consoleArea: {
    margin: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  consoleUI: {
    flex: 1,
    backgroundColor: '#CCCCCC',
    color: '#ffffff',
    padding: 10,
    width: Dimensions.get('window').width - 60,
  },
  consoleText: {
    padding: 10,
  },
  buttonArea: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 30,
  },
});
