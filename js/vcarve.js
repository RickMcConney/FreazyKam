/**
 * vcarve.js — V-carve toolpath graph utilities
 *
 * Graph structure used by dijkstraToTarget():
 *   - Nodes are string keys representing positions along V-carve bisector paths
 *     (typically formatted as "pathIndex_pointIndex").
 *   - Edges connect adjacent bisector points within a path and between overlapping
 *     paths where the V-bit circles are tangent or overlapping.
 *   - Edge weight is the Euclidean distance between the two bisector points,
 *     so Dijkstra finds the shortest physical travel distance through the material.
 *
 * Typical call sequence (from toolPath.js):
 *   1. Build graph object: graph[nodeKey] = [{node, weight}, ...]
 *   2. Call dijkstraToTarget(graph, startNode, endNode) to get the ordered
 *      sequence of bisector nodes the tool should follow.
 *   3. Map node keys back to {x, y, r} points to generate the toolpath.
 */
class PriorityQueue {
    constructor() {
        this.values = [];
    }
    
    enqueue(val, priority) {
        const node = { val, priority };
        this.values.push(node);
        this._bubbleUp();
    }
    
    dequeue() {
        if (!this.values.length) return null;
        const min = this.values[0];
        const end = this.values.pop();
        if (this.values.length) {
            this.values[0] = end;
            this._sinkDown();
        }
        return min;
    }
    
    _bubbleUp() {
        let idx = this.values.length - 1;
        const element = this.values[idx];
        while (idx > 0) {
            const parentIdx = Math.floor((idx - 1) / 2);
            const parent = this.values[parentIdx];
            if (element.priority >= parent.priority) break;
            this.values[parentIdx] = element;
            this.values[idx] = parent;
            idx = parentIdx;
        }
    }
    
    _sinkDown() {
        let idx = 0;
        const length = this.values.length;
        const element = this.values[0];
        while (true) {
            const leftChildIdx = 2 * idx + 1;
            const rightChildIdx = 2 * idx + 2;
            let leftChild, rightChild;
            let swap = null;
            
            if (leftChildIdx < length) {
                leftChild = this.values[leftChildIdx];
                if (leftChild.priority < element.priority) {
                    swap = leftChildIdx;
                }
            }
            if (rightChildIdx < length) {
                rightChild = this.values[rightChildIdx];
                if ((swap === null && rightChild.priority < element.priority) || 
                    (swap !== null && rightChild.priority < leftChild.priority)) {
                    swap = rightChildIdx;
                }
            }
            if (swap === null) break;
            this.values[idx] = this.values[swap];
            this.values[swap] = element;
            idx = swap;
        }
    }
}

// Function to reconstruct the path by backtracking from the target.
// predecessors is a Map<nodeId, nodeId>; nodes not in the map terminate the chain.
function reconstructPath(predecessors, startNode, targetNode) {
    const path = [];
    let current = targetNode;
    while (current !== undefined && current !== null) {
        path.unshift(current);
        if (current === startNode) break;
        current = predecessors.get(current);
    }
    return path;
}

function dijkstraToTarget(graph, startNode, targetNode) {
    // Sparse data: Map<nodeId, number/nodeId>. Nodes not in map are implicitly
    // at distance Infinity. Avoids O(V) init scan of every vertex in the graph.
    const distances = new Map();
    const predecessors = new Map();
    const pq = new PriorityQueue();

    distances.set(startNode, 0);
    pq.enqueue(startNode, 0);

    while (pq.values.length) {
        const { val: currentVertex, priority: currentDistance } = pq.dequeue();

        // Stop the algorithm as soon as the target is reached
        if (currentVertex === targetNode) {
            const shortestPath = reconstructPath(predecessors, startNode, targetNode);
            const totalDistance = distances.get(targetNode);
            return { path: shortestPath, distance: totalDistance };
        }

        if (currentDistance > distances.get(currentVertex)) continue;

        for (const neighbor of graph[currentVertex]) {
            const { node, weight } = neighbor;
            const newDistance = currentDistance + weight;
            const existing = distances.get(node);
            if (existing === undefined || newDistance < existing) {
                distances.set(node, newDistance);
                predecessors.set(node, currentVertex);
                pq.enqueue(node, newDistance);
            }
        }
    }

    return { path: null, distance: Infinity };
}

// Single Dijkstra that stops as soon as any node in targetSet is popped.
// Replaces N separate Dijkstra calls when searching for the nearest of many targets.
function dijkstraToAnyTarget(graph, startNode, targetSet) {
    const distances = new Map();
    const predecessors = new Map();
    const pq = new PriorityQueue();

    distances.set(startNode, 0);
    pq.enqueue(startNode, 0);

    while (pq.values.length) {
        const { val: currentVertex, priority: currentDistance } = pq.dequeue();

        if (targetSet.has(currentVertex)) {
            const shortestPath = reconstructPath(predecessors, startNode, currentVertex);
            return { path: shortestPath, distance: distances.get(currentVertex), targetId: currentVertex };
        }

        if (currentDistance > distances.get(currentVertex)) continue;

        for (const neighbor of graph[currentVertex]) {
            const { node, weight } = neighbor;
            const newDistance = currentDistance + weight;
            const existing = distances.get(node);
            if (existing === undefined || newDistance < existing) {
                distances.set(node, newDistance);
                predecessors.set(node, currentVertex);
                pq.enqueue(node, newDistance);
            }
        }
    }

    return { path: null, distance: Infinity, targetId: null };
}



function findTopLeftNode(nodeMap) {
    let min = Infinity;
    let start = null;

    nodeMap.forEach(p => {
        const d = Math.sqrt(p.x * p.x + p.y * p.y);
        if (d < min) { min = d; start = p; }
    });

    return start;
}

function findTargetNodes(startKey, nodeMap) {
    const targetNodes = [];
    nodeMap.forEach(p => {
        if (!p.visited && p.connections.size == 1) {
            targetNodes.push(p);
        }
    });
    if (targetNodes.length == 0) {
        targetNodes.push(findClosestUnvisitedNode(startKey, nodeMap));
    }
    return targetNodes;
}

function findClosestTarget(startKey, nodeMap, graph) {
    const targetNodes = findTargetNodes(startKey, nodeMap);
    if (targetNodes.length === 0) return { target: null, path: null };

    const targetSet = new Set();
    for (const p of targetNodes) {
        if (p) targetSet.add(p.id);
    }
    if (targetSet.size === 0) return { target: null, path: null };

    const result = dijkstraToAnyTarget(graph, startKey, targetSet);
    if (!result.path) return { target: null, path: null };

    return { target: nodeMap.get(result.targetId), path: result.path };
}

function findClosestUnvisitedNode(startKey, nodeMap) {
    let min = Infinity;
    let target = null;
    const startNode = nodeMap.get(startKey);

    nodeMap.forEach(p => {
        if (!p.visited && p.id !== startKey) {
            const dx = p.x - startNode.x, dy = p.y - startNode.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < min) {
                min = dist;
                target = p;
            }
        }
    });

    return target;
}
function parseJSPolySegmentsToGraph(segments) {
    const nodeMap = new Map(); // Map from "x,y" key to node data
    const graph = {}; // Adjacency list with weights

    // First pass: Create all unique nodes
    for (const segment of segments) {
        const p0Key = `${segment.point0.x.toFixed(1)},${segment.point0.y.toFixed(1)}`;
        const p1Key = `${segment.point1.x.toFixed(1)},${segment.point1.y.toFixed(1)}`;

        if (!nodeMap.has(p0Key)) {
            nodeMap.set(p0Key, {
                id: p0Key,
                x: segment.point0.x,
                y: segment.point0.y,
                r: segment.point0.radius || segment.point0.r || 0,
                connections: new Set()
            });
            graph[p0Key] = [];
        }

        if (!nodeMap.has(p1Key)) {
            nodeMap.set(p1Key, {
                id: p1Key,
                x: segment.point1.x,
                y: segment.point1.y,
                r: segment.point1.radius || segment.point1.r || 0,
                connections: new Set()
            });
            graph[p1Key] = [];
        }

        // Add bidirectional connections and graph edges (only if different nodes)
        if (p0Key !== p1Key) {
            const node0 = nodeMap.get(p0Key);
            const node1 = nodeMap.get(p1Key);

            node0.connections.add(p1Key);
            node1.connections.add(p0Key);

            const dx0 = node0.x - node1.x, dy0 = node0.y - node1.y;
            const distance = Math.sqrt(dx0 * dx0 + dy0 * dy0);

            graph[p0Key].push({ node: p1Key, weight: distance });
            graph[p1Key].push({ node: p0Key, weight: distance });
        }
    }

    return { nodeMap, graph };
}


function findStartNodes(nodeMap) {
    // First collect all potential start nodes as before
    const startNodes = [];
    nodeMap.forEach(n => {
        if (n.connections.size == 1) {
            startNodes.push(n);
        }
    });

    // If no nodes with single connection, use original fallback
    if (startNodes.length == 0) {
        startNodes.push(findTopLeftNode(nodeMap));
        return startNodes;
    }

    if (startNodes.length > 4) {
        // Find bounding box of all start nodes
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        startNodes.forEach(node => {
            minX = Math.min(minX, node.x);
            minY = Math.min(minY, node.y);
            maxX = Math.max(maxX, node.x);
            maxY = Math.max(maxY, node.y);
        });

        // Find nodes closest to each corner of bounding box
        const corners = [
            { x: minX, y: minY }, // Bottom-left
            { x: maxX, y: minY }, // Bottom-right
            { x: minX, y: maxY }, // Top-left
            { x: maxX, y: maxY }  // Top-right
        ];

        const cornerNodes = corners.map(corner => {
            let minDist = Infinity;
            let closestNode = null;

            startNodes.forEach(node => {
                const cdx = node.x - corner.x, cdy = node.y - corner.y;
                const dist = Math.sqrt(cdx * cdx + cdy * cdy);
                if (dist < minDist) {
                    minDist = dist;
                    closestNode = node;
                }
            });

            return closestNode;
        });

        // Filter out duplicates while preserving order
        return [...new Set(cornerNodes.filter(node => node !== null))];
    }
    else
        return startNodes;
}

const distanceCache = new Map();

function getCachedDistance(node1, node2) {
    const [a, b] = node1.id < node2.id ? [node1, node2] : [node2, node1];
    let inner = distanceCache.get(a.id);
    if (!inner) { inner = new Map(); distanceCache.set(a.id, inner); }
    let d = inner.get(b.id);
    if (d === undefined) {
        const dx = a.x - b.x, dy = a.y - b.y;
        d = Math.sqrt(dx * dx + dy * dy);
        inner.set(b.id, d);
    }
    return d;
}

function findBestPath(jspolySegments) {
    if (!jspolySegments || jspolySegments.length === 0) {
        return { toolpath: [], travelDistance: 0 };
    }

    distanceCache.clear();

    const { nodeMap, graph } = parseJSPolySegmentsToGraph(jspolySegments);

    let startNodes = findStartNodes(nodeMap);
    let bestPath = [];
    let bestCost = Infinity;

    for (const startNode of startNodes) {
        let result = findPossiblePath(nodeMap, graph, startNode);
        if (result.travelDistance < bestCost) {
            bestCost = result.travelDistance;
            bestPath = result.toolpath;
        }
    }

    return { toolpath: bestPath, travelDistance: bestCost };

}

function makeEdgeKey(a, b) {
    return a < b ? a + '|' + b : b + '|' + a;
}

function findPossiblePath(nodeMap, graph, startNode) {
    const toolPath = [];
    let travel = 0;
    let node = startNode;
    const traversedEdges = new Set();

    // Reset visited states
    nodeMap.forEach(n => n.visited = false);

    // Mark start node as visited and add to path
    node.visited = true;
    toolPath.push({ x: node.x, y: node.y, r: node.r });

    let result = findClosestTarget(node.id, nodeMap, graph);

    // Main path finding loop
    while (result.target && result.path?.length > 1) {
        const target = result.target;
        const path = result.path;

        // Process all nodes in current path
        let prevId = node.id;
        for (let i = 1; i < path.length; i++) {
            const nextNode = nodeMap.get(path[i]);
            nextNode.visited = true;
            toolPath.push({ x: nextNode.x, y: nextNode.y, r: nextNode.r });
            travel += getCachedDistance(node, nextNode);
            traversedEdges.add(makeEdgeKey(prevId, path[i]));
            prevId = path[i];
            node = nextNode;
        }
        result = findClosestTarget(node.id, nodeMap, graph);
    }

    // Second pass: traverse any untraversed edges (completes loops).
    // Uses a single multi-target Dijkstra per walk to find the graph-nearest
    // untraversed-edge endpoint, and opportunistically covers any untraversed
    // edges encountered along the walk.
    const untraversedEdges = new Map(); // ek -> {from, to}
    nodeMap.forEach((n, key) => {
        n.connections.forEach(connId => {
            const ek = makeEdgeKey(key, connId);
            if (!traversedEdges.has(ek) && !untraversedEdges.has(ek)) {
                untraversedEdges.set(ek, { from: key, to: connId });
            }
        });
    });

    while (untraversedEdges.size > 0) {
        // Build set of endpoint IDs of remaining untraversed edges
        const endpointSet = new Set();
        for (const { from, to } of untraversedEdges.values()) {
            endpointSet.add(from);
            endpointSet.add(to);
        }

        // Walk to the graph-nearest endpoint if not already at one
        if (!endpointSet.has(node.id)) {
            const navResult = dijkstraToAnyTarget(graph, node.id, endpointSet);
            if (!navResult.path || navResult.path.length < 2) break;
            for (let i = 1; i < navResult.path.length; i++) {
                const nextNode = nodeMap.get(navResult.path[i]);
                const ek = makeEdgeKey(navResult.path[i - 1], navResult.path[i]);
                toolPath.push({ x: nextNode.x, y: nextNode.y, r: nextNode.r });
                traversedEdges.add(ek);
                untraversedEdges.delete(ek); // cover edges we crossed en route
                travel += getCachedDistance(node, nextNode);
                node = nextNode;
            }
        }

        // At an untraversed-edge endpoint — traverse one of its untraversed edges
        let advanced = false;
        for (const connId of node.connections) {
            const ek = makeEdgeKey(node.id, connId);
            if (untraversedEdges.has(ek)) {
                const farNode = nodeMap.get(connId);
                toolPath.push({ x: farNode.x, y: farNode.y, r: farNode.r });
                traversedEdges.add(ek);
                untraversedEdges.delete(ek);
                travel += getCachedDistance(node, farNode);
                node = farNode;
                advanced = true;
                break;
            }
        }
        // If this endpoint's untraversed edges all got covered en route,
        // loop again to build a fresh endpointSet and pick another.
        if (!advanced) continue;
    }

    // Return to start if needed and possible
    if (startNode.id !== node.id && node.connections.has(startNode.id)) {
        const dx = startNode.x - node.x;
        const dy = startNode.y - node.y;
        travel += Math.sqrt(dx * dx + dy * dy);
        toolPath.push({ x: startNode.x, y: startNode.y, r: startNode.r });
    }

    return { toolpath: toolPath, travelDistance: travel };
}








