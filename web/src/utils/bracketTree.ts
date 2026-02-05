/**
 * Utility functions for navigating the bracket tree structure.
 *
 * These helpers provide tree traversal without position arithmetic,
 * using explicit parent/child relationships.
 */

import type { BracketTree, BracketTreeNode, BracketTreeHelpers } from '../types';

/**
 * Create helper functions for navigating a bracket tree.
 *
 * @param tree The bracket tree to navigate
 * @returns Helper functions for tree traversal
 */
export function createBracketTreeHelpers(tree: BracketTree): BracketTreeHelpers {
  /**
   * Get a node by its ID.
   */
  function getNode(id: string): BracketTreeNode | undefined {
    return tree.nodes[id];
  }

  /**
   * Get the parent node that a winner advances to.
   */
  function getParent(node: BracketTreeNode): BracketTreeNode | undefined {
    if (!node.parent_id) return undefined;
    return tree.nodes[node.parent_id];
  }

  /**
   * Get the left (top/higher seed) child node.
   */
  function getLeftChild(node: BracketTreeNode): BracketTreeNode | undefined {
    if (!node.left_child_id) return undefined;
    return tree.nodes[node.left_child_id];
  }

  /**
   * Get the right (bottom/lower seed) child node.
   */
  function getRightChild(node: BracketTreeNode): BracketTreeNode | undefined {
    if (!node.right_child_id) return undefined;
    return tree.nodes[node.right_child_id];
  }

  /**
   * Get the sibling node (the other child of this node's parent).
   * Returns undefined if no parent or no sibling.
   */
  function getSibling(node: BracketTreeNode): BracketTreeNode | undefined {
    const parent = getParent(node);
    if (!parent) return undefined;

    // Sibling is the other child of our parent
    if (parent.left_child_id === node.id) {
      return parent.right_child_id ? tree.nodes[parent.right_child_id] : undefined;
    } else {
      return parent.left_child_id ? tree.nodes[parent.left_child_id] : undefined;
    }
  }

  /**
   * Get all nodes from this node to the root (championship).
   * Returns array starting with the given node and ending with the root.
   */
  function getPathToRoot(node: BracketTreeNode): BracketTreeNode[] {
    const path: BracketTreeNode[] = [node];
    let current = node;

    while (current.parent_id) {
      const parent = tree.nodes[current.parent_id];
      if (!parent) break;
      path.push(parent);
      current = parent;
    }

    return path;
  }

  /**
   * Get a node by its round and position (for backward compatibility).
   * Uses the position_index for O(1) lookup.
   */
  function getNodeByPosition(round: number, position: number): BracketTreeNode | undefined {
    const key = `R${round}-P${position}`;
    const nodeId = tree.position_index[key];
    if (!nodeId) return undefined;
    return tree.nodes[nodeId];
  }

  return {
    getNode,
    getParent,
    getLeftChild,
    getRightChild,
    getSibling,
    getPathToRoot,
    getNodeByPosition,
  };
}

/**
 * Get all teams that could potentially reach a given node.
 * Returns an array of team names with their probabilities.
 */
export function getCandidatesForNode(
  node: BracketTreeNode
): Array<{ team: string; probability: number }> {
  return Object.entries(node.teams)
    .filter(([_, prob]) => prob > 0.001) // Filter negligible probabilities
    .map(([team, probability]) => ({ team, probability }))
    .sort((a, b) => b.probability - a.probability);
}

/**
 * Check if a node has a determined winner (either completed or 100% probability).
 */
export function hasWinner(node: BracketTreeNode): boolean {
  if (node.is_completed && node.winner) return true;

  // Check if any team has 100% probability
  return Object.values(node.teams).some((prob) => prob >= 0.9999);
}

/**
 * Get the determined winner of a node, if any.
 */
export function getWinner(node: BracketTreeNode): string | null {
  if (node.is_completed && node.winner) return node.winner;

  // Find team with 100% probability
  for (const [team, prob] of Object.entries(node.teams)) {
    if (prob >= 0.9999) return team;
  }

  return null;
}

/**
 * Get the children of a node as an array (excludes undefined).
 */
export function getChildren(
  helpers: BracketTreeHelpers,
  node: BracketTreeNode
): BracketTreeNode[] {
  const children: BracketTreeNode[] = [];
  const left = helpers.getLeftChild(node);
  const right = helpers.getRightChild(node);
  if (left) children.push(left);
  if (right) children.push(right);
  return children;
}

/**
 * Check if a node is a leaf (has no children).
 */
export function isLeafNode(node: BracketTreeNode): boolean {
  return !node.left_child_id && !node.right_child_id;
}

/**
 * Get all nodes in a specific round.
 */
export function getNodesInRound(tree: BracketTree, round: number): BracketTreeNode[] {
  return Object.values(tree.nodes).filter((node) => node.round === round);
}

/**
 * Get all play-in nodes (round -1).
 */
export function getPlayInNodes(tree: BracketTree): BracketTreeNode[] {
  return Object.values(tree.nodes).filter((node) => node.is_play_in);
}

/**
 * Get nodes in a specific region.
 */
export function getNodesInRegion(
  tree: BracketTree,
  region: string
): BracketTreeNode[] {
  return Object.values(tree.nodes).filter((node) => node.region === region);
}
