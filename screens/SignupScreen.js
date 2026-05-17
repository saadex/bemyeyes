import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView 
} from 'react-native';
import { useAuth } from "../contexts/AuthContext";

const SignupScreen = ({ navigation }) => {
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cpassword, setCPassword] = useState('');
  const [error, setError] = useState({});
  const [loading, setLoading] = useState(false);

  const submitDetails = async () => {
    const newError = {};
    if (!email.trim() || !email.includes('@') || !email.includes('.')) newError.email = "Valid email is required";
    if (!password.trim()) newError.password = "Password is required";
    if (!cpassword.trim()) newError.cpassword = "Confirmation Password is required";

    setError(newError);

    if (password !== cpassword) {
      setError({ general: "Passwords do not match" });
      return;
    }

    if (Object.keys(newError).length === 0) {
      setLoading(true);
      try {
        await signup(email, password);
      } catch (error) {
        setError({ general: error.message || "Failed to create account" });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sign Up</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        placeholder='Enter your email'
        keyboardType='email-address'
        autoCapitalize='none'
        value={email}
        onChangeText={setEmail}
      />
      {error.email && <Text style={styles.error}>{error.email}</Text>}

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        placeholder='Enter password'
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error.password && <Text style={styles.error}>{error.password}</Text>}

      <Text style={styles.label}>Confirm Password</Text>
      <TextInput
        style={styles.input}
        placeholder='Re-enter password'
        secureTextEntry
        value={cpassword}
        onChangeText={setCPassword}
      />
      {error.cpassword && <Text style={styles.error}>{error.cpassword}</Text>}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={submitDetails}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Creating Account...' : 'Sign Up'}
        </Text>
      </TouchableOpacity>
      {error.general && <Text style={styles.error}>{error.general}</Text>}

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.switchText}>
          Already have an account? Log in
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#333',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 10,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  error: {
    color: 'red',
    fontSize: 12,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#007bff',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    marginTop: 20,
    textAlign: 'center',
    color: '#007bff',
    fontSize: 14,
  },
});

export default SignupScreen;
