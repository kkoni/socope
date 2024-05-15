import { useState, useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from 'react-native-paper';
import { DateHour } from '../model/lib/date';
import { SerializableValueSet } from '../model/lib/util';
import { GroupId, PostId } from '../model/data';
import { PostIndex } from '../model/posts/data';
import { getPostIndexRepository } from '../model/posts/repositories';

const INITIAL_LIMIT_OF_POSTS = 100;
const INITIAL_LIMIT_OF_DAYS = 30;

type Props = {
  groupId: GroupId;
};

export default function GroupTimeline(props: Props) {
  const [ lastUpdatedAt, setLastUpdatedAt ] = useState<Date | undefined>(undefined);
  const [ mostRecentDateHour, setMostRecentDateHour ] = useState<DateHour | undefined>(undefined);
  const [ postIdsInMostRecentDateHour, setPostIdsInMostRecentDateHour ] = useState<SerializableValueSet<PostId>>(new SerializableValueSet<PostId>());
  const [ postIndices, setPostIndices ] = useState<PostIndex[]>([]);

  async function loadPostIndices() {
    const postIndexRepository = await getPostIndexRepository();
    const firstDateHour = DateHour.of(new Date())
    const initialPostIndices: PostIndex[] = [];
    for (let dateHour = firstDateHour, counter = 0; initialPostIndices.length < INITIAL_LIMIT_OF_POSTS && counter < INITIAL_LIMIT_OF_DAYS * 24; dateHour = dateHour.prev(), counter++) {
      const postIndicesInDateHour = await postIndexRepository.get(props.groupId, dateHour);
      initialPostIndices.push(...postIndicesInDateHour);
      if (dateHour.equals(firstDateHour)) {
        for (const postIndex of postIndicesInDateHour) {
          postIdsInMostRecentDateHour.add(postIndex.postId);
        }          
      }
    }
    setMostRecentDateHour(firstDateHour);
    setPostIndices(initialPostIndices);
    setLastUpdatedAt(new Date());
  }

  useEffect(() => {(async () => {
    await loadPostIndices();
  })()}, [ props.groupId ]);

  const postViews = postIndices.map(postIndex => { return (
    <View key={postIndex.postId.toString()}>
      <Text>{postIndex.postId.toString()}</Text><Text>{postIndex.postedAt.toString()}</Text>
    </View>
  )});

  return (
    <ScrollView>
      {postViews}
    </ScrollView>
  );
}
