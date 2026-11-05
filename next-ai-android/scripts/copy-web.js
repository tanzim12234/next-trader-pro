const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'web');
const target = path.join(root, 'www');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

const android = path.join(root, 'android');
if (fs.existsSync(android)) {
  const javaDir = path.join(android, 'app/src/main/java/com/nexttrader/nextai');
  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(path.join(javaDir, 'NextSecureStoragePlugin.java'), `package com.nexttrader.nextai;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NextSecureStorage")
public class NextSecureStoragePlugin extends Plugin {
  private static final String ALIAS = "next_ai_android_master_key";
  private static final String PREFS = "next_ai_secure_store";
  private SecretKey getKey() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
    KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    kg.init(new KeyGenParameterSpec.Builder(ALIAS,
      KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true).build());
    return kg.generateKey();
  }
  @PluginMethod public void set(PluginCall call) {
    String key = call.getString("key"); String value = call.getString("value");
    if (key == null || value == null || key.length() > 64 || value.length() > 8192) {
      call.reject("Invalid key or value"); return;
    }
    try {
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, getKey());
      byte[] encrypted = c.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      byte[] iv = c.getIV();
      ByteBuffer b = ByteBuffer.allocate(4 + iv.length + encrypted.length);
      b.putInt(iv.length); b.put(iv); b.put(encrypted);
      getContext().getSharedPreferences(PREFS, 0).edit()
        .putString(key, Base64.encodeToString(b.array(), Base64.NO_WRAP)).apply();
      call.resolve();
    } catch (Exception e) { call.reject("Secure storage failed", e); }
  }
  @PluginMethod public void get(PluginCall call) {
    String key = call.getString("key");
    if (key == null) { call.reject("Missing key"); return; }
    try {
      String raw = getContext().getSharedPreferences(PREFS, 0).getString(key, null);
      if (raw == null) { call.resolve(new JSObject()); return; }
      ByteBuffer b = ByteBuffer.wrap(Base64.decode(raw, Base64.NO_WRAP));
      int n = b.getInt(); byte[] iv = new byte[n]; b.get(iv);
      byte[] data = new byte[b.remaining()]; b.get(data);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, iv));
      JSObject result = new JSObject();
      result.put("value", new String(c.doFinal(data), java.nio.charset.StandardCharsets.UTF_8));
      call.resolve(result);
    } catch (Exception e) { call.reject("Secure storage read failed", e); }
  }
  @PluginMethod public void remove(PluginCall call) {
    String key = call.getString("key");
    if (key == null) { call.reject("Missing key"); return; }
    getContext().getSharedPreferences(PREFS, 0).edit().remove(key).apply(); call.resolve();
  }
}`);
  fs.writeFileSync(path.join(javaDir, 'MainActivity.kt'), `package com.nexttrader.nextai

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    registerPlugin(NextSecureStoragePlugin::class.java)
    super.onCreate(savedInstanceState)
  }
}
`);
  const manifest = path.join(android, 'app/src/main/AndroidManifest.xml');
  if (fs.existsSync(manifest)) {
    let xml = fs.readFileSync(manifest, 'utf8');
    if (!xml.includes('android.permission.INTERNET')) xml = xml.replace('<manifest', '<manifest\\n    xmlns:tools="http://schemas.android.com/tools"');
    if (!xml.includes('android.permission.RECORD_AUDIO')) xml = xml.replace('<application', '<uses-permission android:name="android.permission.RECORD_AUDIO" />\\n    <uses-permission android:name="android.permission.INTERNET" />\\n    <application');
    fs.writeFileSync(manifest, xml);
  }
}
console.log('Android assets and Keystore-backed plugin generated.');
