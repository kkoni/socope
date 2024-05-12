import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, Portal, Snackbar } from 'react-native-paper';
import { getPostIndexRepository } from '../model/posts/repositories';
import { getFeedFetchResultRepository } from '../model/worker/repositories';

export default function DevTools() {
  const [ snackbarVisible, setSnackbarVisible ] = useState(false);
  const [ snackbarText, setSnackbarText ] = useState('');

  const deleteAllPostIndices = async () => {
    (await getPostIndexRepository()).deleteAll();
    setSnackbarText('All PostIndices Deleted');
    setSnackbarVisible(true);
  };

  const deleteAllFeedFetchResults = async () => {
    (await getFeedFetchResultRepository()).deleteAll();
    setSnackbarText('All FeedFetchResults Deleted');
    setSnackbarVisible(true);
  }

  return (
    <View style={styles.topContainer}>
      <View style={styles.operationContainer}>
        <Text style={styles.operationName}>Delete All PostIndices</Text>
        <Button onPress={deleteAllPostIndices}>DELETE</Button>
      </View>
      <View style={styles.operationContainer}>
        <Text style={styles.operationName}>Delete All FeedFetchResults</Text>
        <Button onPress={deleteAllFeedFetchResults}>DELETE</Button>
      </View>
      <Portal>
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => setSnackbarVisible(false)}
          duration={3000}
          style={styles.snackbar}
        >
          <Text style={styles.snackbarText}>{snackbarText}</Text>
        </Snackbar>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  topContainer: { flex: 1, flexDirection: 'column' },
  operationContainer: { flexDirection: 'row', justifyContent: 'center' },
  operationName: { flex: 2 },
  operationButton: { flex: 1 },
  snackbar: { backgroundColor: 'limegreen' },
  snackbarText: { color: 'white' },
});
