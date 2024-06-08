import { useState, useEffect } from 'react';
import { ScrollView } from 'react-native';
import { DateHour } from '../model/lib/date';
import { SerializableValueSet, SerializableKeyMap } from '../model/lib/util';
import { GroupId, PostId, Post } from '../model/data';
import { getPostRepository } from '../model/repositories';
import { PostIndex } from '../model/posts/data';
import { getPostIndexRepository } from '../model/posts/repositories';
import PostView from './PostView';

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
  const [ loadedPosts, setLoadedPosts ] = useState<SerializableKeyMap<PostId, Post>>(new SerializableKeyMap<PostId, Post>());
  const [ loadedPostIds, setLoadedPostIds ] = useState<SerializableValueSet<PostId>>(new SerializableValueSet<PostId>());

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
    loadPosts(initialPostIndices.map(postIndex => postIndex.postId));
  }

  async function loadPosts(postIds: PostId[]) {
    for (const postId of postIds) {
      loadedPostIds.add(postId);
    }
    for (const [postId, post] of (await getPostRepository().get(postIds)).entries()) {
      loadedPosts.set(postId, post);
    }
    setLoadedPostIds(loadedPostIds.clone());
    setLoadedPosts(loadedPosts.clone());
  }

  useEffect(() => {(async () => {
    await loadPostIndices();
  })()}, [ props.groupId ]);

  const postViews = postIndices.map(postIndex => {
    if (loadedPostIds.has(postIndex.postId) && !loadedPosts.has(postIndex.postId)) {
      return undefined;
    }
    return (
      <PostView key={postIndex.postId.toString()} postIndex={postIndex} post={loadedPosts.get(postIndex.postId)}/>
    );
  }).filter(postView => postView !== undefined);

  return (
    <ScrollView>
      {postViews}
    </ScrollView>
  );
}
