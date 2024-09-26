import { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Divider, Text } from 'react-native-paper';
import { DateHour } from '../model/lib/date';
import { SerializableValueSet, SerializableKeyMap } from '../model/lib/util';
import { GroupId, PostId, Post, ActorId } from '../model/data';
import { getPostRepository } from '../model/repositories';
import { PostIndex } from '../model/posts/data';
import { getPostIndexRepository, getNewPostIndicesRepository } from '../model/posts/repositories';
import PostView from './PostView';

const INITIAL_LIMIT_OF_POSTS = 100;
const INITIAL_LIMIT_OF_DAYS = 30;
const LIMIT_OF_POSTS = 1000;

type Props = {
  groupId: GroupId;
};

export default function GroupTimeline(props: Props) {
  const [ postIndices, setPostIndices ] = useState<PostIndex[]>([]);
  const [ postIds, setPostIds ] = useState<SerializableValueSet<PostId>>(new SerializableValueSet<PostId>());
  const [ loadedPosts, setLoadedPosts ] = useState<SerializableKeyMap<PostId, Post>>(new SerializableKeyMap<PostId, Post>());
  const [ loadedPostIds, setLoadedPostIds ] = useState<SerializableValueSet<PostId>>(new SerializableValueSet<PostId>());
  const [ newPostIndices, setNewPostIndices ] = useState<PostIndex[]>([]);

  async function loadPostIndices() {
    const postIndexRepository = await getPostIndexRepository();
    const firstDateHour = DateHour.of(new Date())
    const initialPostIndices: PostIndex[] = [];
    for (let dateHour = firstDateHour, counter = 0; initialPostIndices.length < INITIAL_LIMIT_OF_POSTS && counter < INITIAL_LIMIT_OF_DAYS * 24; dateHour = dateHour.prev(), counter++) {
      const postIndicesInDateHour = await postIndexRepository.get(props.groupId, dateHour);
      initialPostIndices.push(...postIndicesInDateHour);
      for (const postIndex of postIndicesInDateHour) {
        postIds.add(postIndex.postId);
      }
    }
    setPostIndices(initialPostIndices);
    loadPosts(initialPostIndices.map(postIndex => postIndex.postId));
  }

  async function loadPosts(postIds: PostId[]) {
    for (const postId of postIds) {
      loadedPostIds.add(postId);
    }
    const referredPostIdSet = new SerializableValueSet<PostId>();
    for (const [postId, post] of (await getPostRepository().get(postIds)).entries()) {
      loadedPosts.set(postId, post);
      if (post.embeddedPostId !== undefined) {
        referredPostIdSet.add(post.embeddedPostId);
      }
      if (post.reply !== undefined) {
        referredPostIdSet.add(post.reply.parentPostId);
        referredPostIdSet.add(post.reply.rootPostId);
      }
    }
    const referredPostIds = Array.from(referredPostIdSet.values()).filter(postId => !loadedPosts.has(postId));
    if (referredPostIds.length > 0) {
      for (const postId of referredPostIds) {
        loadedPostIds.add(postId);
      }
      for (const [postId, post] of (await getPostRepository().get(referredPostIds)).entries()) {
        loadedPosts.set(postId, post);
      }
    }

    setLoadedPostIds(loadedPostIds.clone());
    setLoadedPosts(loadedPosts.clone());
  }

  async function loadNewPostIndices() {
    const newPostIndicesRepository = getNewPostIndicesRepository();
    const polledNewPostIndices = newPostIndicesRepository.poll(props.groupId).filter(postIndex => !postIds.has(postIndex.postId));
    if (polledNewPostIndices.length > 0) {
      setNewPostIndices(newPostIndices.concat(polledNewPostIndices));
    }
    for (const postIndex of newPostIndices) {
      postIds.add(postIndex.postId);
    }
  }

  async function showNewPosts() {
    newPostIndices.sort((p1, p2) => p2.postedAt.getTime() - p1.postedAt.getTime());
    const updatedPostIndices = newPostIndices.concat(postIndices);
    updatedPostIndices.splice(LIMIT_OF_POSTS);
    setPostIndices(updatedPostIndices);
    loadPosts(newPostIndices.map(postIndex => postIndex.postId));
    setNewPostIndices([]);
  }

  useEffect(() => {(async () => {
    await loadPostIndices();
    const intervalId = setInterval(async () => {
      await loadNewPostIndices();
    }, 10000);
    return () => clearInterval(intervalId);
  })()}, [ props.groupId ]);

  const newPostsView = (
    <View>
      <Text style={styles.newPostsView} onPress={showNewPosts}>{newPostIndices.length} New Posts</Text>
    </View>
  );

  const postViews = postIndices.map(postIndex => {
    if (loadedPostIds.has(postIndex.postId) && !loadedPosts.has(postIndex.postId)) {
      return undefined;
    }
    const post = loadedPosts.get(postIndex.postId);
    const embeddedPost = post?.embeddedPostId ? loadedPosts.get(post.embeddedPostId) : undefined;
    const parentPost = post?.reply?.parentPostId ? loadedPosts.get(post.reply.parentPostId) : undefined;
    const rootPost = post?.reply?.rootPostId ? loadedPosts.get(post.reply.rootPostId) : undefined;
    return (
      <View key={postIndex.postId.toString()}>
        <PostView postIndex={postIndex} post={post} embeddedPost={embeddedPost} parentPost={parentPost} rootPost={rootPost}/>
        <Divider style={styles.divider}/>
      </View>
    );
  }).filter(postView => postView !== undefined);

  return (
    <ScrollView>
      { newPostIndices.length > 0 && newPostsView }
      <View>
        {postViews}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  divider: { marginVertical: 5 },
  newPostsView: { color: 'deepskyblue', marginVertical: 10, textAlign: 'center' },
});