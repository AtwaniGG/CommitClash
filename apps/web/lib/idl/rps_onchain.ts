/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rps_onchain.json`.
 */
export type RpsOnchain = {
  "address": "DymxJfPVGFD3BD1DWk6KeXaj7uPQhSFo2xXB3A8LuBFG",
  "metadata": {
    "name": "rpsOnchain",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On-chain Rock-Paper-Scissors with FIFO matchmaking, commit-reveal, and session-key auto-reveal"
  },
  "instructions": [
    {
      "name": "adminUpdateConfig",
      "docs": [
        "Admin-only. Update treasury or reveal timeout. Does NOT change pool entry amounts."
      ],
      "discriminator": [
        224,
        243,
        100,
        135,
        120,
        165,
        43,
        244
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "newTreasury",
          "docs": [
            "Optional new treasury token account. Pass the existing treasury to leave unchanged."
          ]
        }
      ],
      "args": [
        {
          "name": "newRevealTimeoutSlots",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "cancelQueueEntry",
      "docs": [
        "Refunds the head of the queue if they've been waiting longer than the reveal timeout.",
        "Anyone may call (permissionless liveness escape)."
      ],
      "discriminator": [
        164,
        183,
        143,
        117,
        118,
        221,
        88,
        10
      ],
      "accounts": [
        {
          "name": "caller",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "headEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              },
              {
                "kind": "account",
                "path": "pool.queue_head",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "headPlayer",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "headPlayerToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "One-time setup. Sets admin, $RPS mint, treasury ATA, reveal timeout."
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "globalStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasury"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "revealTimeoutSlots",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializePool",
      "docs": [
        "Admin-only. Creates a new stake-tier pool: Pool, Vault ATA, PoolStats.",
        "`entry_amount` must satisfy `entry_amount % 4 == 0` so the pot splits cleanly into eighths."
      ],
      "discriminator": [
        95,
        180,
        10,
        172,
        84,
        174,
        232,
        40
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "poolStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        },
        {
          "name": "entryAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "joinAndMatch",
      "docs": [
        "Join a pool when its queue has someone waiting. Pairs with the head of the queue, creates a Match."
      ],
      "discriminator": [
        19,
        244,
        249,
        54,
        67,
        76,
        130,
        19
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "headEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              },
              {
                "kind": "account",
                "path": "pool.queue_head",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "headPlayer",
          "writable": true
        },
        {
          "name": "theMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              },
              {
                "kind": "account",
                "path": "pool.next_match_id",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "playerStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "playerTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        },
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "sessionKey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "joinSolo",
      "docs": [
        "Join a pool when its queue is empty. Stakes tokens, registers commitment + session key."
      ],
      "discriminator": [
        13,
        5,
        246,
        111,
        66,
        79,
        155,
        116
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "queueEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              },
              {
                "kind": "account",
                "path": "pool.queue_tail",
                "account": "pool"
              }
            ]
          }
        },
        {
          "name": "playerStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "player"
              }
            ]
          }
        },
        {
          "name": "playerTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        },
        {
          "name": "commitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "sessionKey",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "resolveTimeout",
      "docs": [
        "Anyone may call after the reveal timeout. Awards 75/12.5/12.5 to whoever revealed,",
        "or refunds both if neither revealed."
      ],
      "discriminator": [
        149,
        55,
        89,
        144,
        121,
        143,
        48,
        210
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone can call after timeout."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "theMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "poolStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "globalStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "playerStatsA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "the_match.player_a",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "playerStatsB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "the_match.player_b",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "playerAToken",
          "writable": true
        },
        {
          "name": "playerBToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        },
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "reveal",
      "docs": [
        "Reveal your move + nonce. Either the player's wallet OR the registered session key may sign.",
        "When both sides have revealed, the match resolves and pays out atomically."
      ],
      "discriminator": [
        9,
        35,
        59,
        190,
        167,
        249,
        76,
        115
      ],
      "accounts": [
        {
          "name": "signer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "pool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "theMatch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "poolStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  111,
                  108,
                  95,
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "globalStats",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  116,
                  115
                ]
              }
            ]
          }
        },
        {
          "name": "playerStatsA",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "the_match.player_a",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "playerStatsB",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "the_match.player_b",
                "account": "match"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "poolId"
              }
            ]
          }
        },
        {
          "name": "treasuryToken",
          "writable": true
        },
        {
          "name": "playerAToken",
          "writable": true
        },
        {
          "name": "playerBToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "poolId",
          "type": "u64"
        },
        {
          "name": "matchId",
          "type": "u64"
        },
        {
          "name": "moveValue",
          "type": "u8"
        },
        {
          "name": "nonce",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "globalStats",
      "discriminator": [
        119,
        53,
        78,
        3,
        254,
        129,
        78,
        28
      ]
    },
    {
      "name": "match",
      "discriminator": [
        236,
        63,
        169,
        38,
        15,
        56,
        196,
        162
      ]
    },
    {
      "name": "playerStats",
      "discriminator": [
        169,
        146,
        242,
        176,
        102,
        118,
        231,
        172
      ]
    },
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "poolStats",
      "discriminator": [
        24,
        180,
        162,
        52,
        37,
        122,
        196,
        98
      ]
    },
    {
      "name": "queueEntry",
      "discriminator": [
        211,
        46,
        29,
        56,
        240,
        146,
        48,
        178
      ]
    }
  ],
  "events": [
    {
      "name": "entryCancelled",
      "discriminator": [
        251,
        119,
        203,
        151,
        58,
        152,
        66,
        15
      ]
    },
    {
      "name": "matched",
      "discriminator": [
        215,
        215,
        126,
        179,
        36,
        175,
        178,
        4
      ]
    },
    {
      "name": "poolInitialized",
      "discriminator": [
        100,
        118,
        173,
        87,
        12,
        198,
        254,
        229
      ]
    },
    {
      "name": "queueJoined",
      "discriminator": [
        56,
        81,
        235,
        53,
        196,
        128,
        138,
        193
      ]
    },
    {
      "name": "resolved",
      "discriminator": [
        148,
        46,
        187,
        66,
        35,
        1,
        255,
        147
      ]
    },
    {
      "name": "revealed",
      "discriminator": [
        180,
        7,
        199,
        88,
        154,
        19,
        181,
        154
      ]
    },
    {
      "name": "timeoutResolved",
      "discriminator": [
        95,
        91,
        134,
        62,
        128,
        161,
        197,
        188
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidMove",
      "msg": "Invalid move (must be 1=Rock, 2=Paper, 3=Scissors)"
    },
    {
      "code": 6001,
      "name": "invalidReveal",
      "msg": "Reveal does not match the registered commitment"
    },
    {
      "code": 6002,
      "name": "alreadyRevealed",
      "msg": "This side has already revealed"
    },
    {
      "code": 6003,
      "name": "matchNotActive",
      "msg": "Match is no longer in AwaitingReveals state"
    },
    {
      "code": 6004,
      "name": "timeoutNotReached",
      "msg": "Reveal timeout has not elapsed yet"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "Caller is not authorized"
    },
    {
      "code": 6006,
      "name": "invalidSigner",
      "msg": "Signer is neither the player nor the registered session key for this match side"
    },
    {
      "code": 6007,
      "name": "queueNotEmpty",
      "msg": "Queue is not empty (use join_and_match instead)"
    },
    {
      "code": 6008,
      "name": "queueEmpty",
      "msg": "Queue is empty (use join_solo instead)"
    },
    {
      "code": 6009,
      "name": "wrongQueueEntry",
      "msg": "Wrong queue entry index passed"
    },
    {
      "code": 6010,
      "name": "invalidEntryAmount",
      "msg": "Entry amount must be a positive multiple of 4 so the pot splits cleanly into eighths"
    },
    {
      "code": 6011,
      "name": "poolMismatch",
      "msg": "Pool ID mismatch on supplied account"
    },
    {
      "code": 6012,
      "name": "matchMismatch",
      "msg": "Match ID mismatch on supplied account"
    },
    {
      "code": 6013,
      "name": "mathOverflow",
      "msg": "Math overflow"
    }
  ],
  "types": [
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "revealTimeoutSlots",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "entryCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "entryIndex",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "refunded",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "globalStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "roundsPlayed",
            "type": "u64"
          },
          {
            "name": "totalBurned",
            "type": "u64"
          },
          {
            "name": "totalToTreasury",
            "type": "u64"
          },
          {
            "name": "totalVolume",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "match",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "sessionKeyA",
            "type": "pubkey"
          },
          {
            "name": "commitmentA",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "revealA",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "playerB",
            "type": "pubkey"
          },
          {
            "name": "sessionKeyB",
            "type": "pubkey"
          },
          {
            "name": "commitmentB",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "revealB",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "pot",
            "type": "u64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "matchState"
              }
            }
          },
          {
            "name": "slotMatched",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "awaitingReveals"
          },
          {
            "name": "resolved"
          },
          {
            "name": "timedOut"
          }
        ]
      }
    },
    {
      "name": "matched",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": "pubkey"
          },
          {
            "name": "pot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "playerStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "wins",
            "type": "u64"
          },
          {
            "name": "losses",
            "type": "u64"
          },
          {
            "name": "ties",
            "type": "u64"
          },
          {
            "name": "currentStreak",
            "type": "u32"
          },
          {
            "name": "bestStreak",
            "type": "u32"
          },
          {
            "name": "totalWagered",
            "type": "u64"
          },
          {
            "name": "totalWon",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "entryAmount",
            "type": "u64"
          },
          {
            "name": "queueHead",
            "type": "u64"
          },
          {
            "name": "queueTail",
            "type": "u64"
          },
          {
            "name": "nextMatchId",
            "type": "u64"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "poolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "entryAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "poolStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "roundsPlayed",
            "type": "u64"
          },
          {
            "name": "volume",
            "type": "u64"
          },
          {
            "name": "burned",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "queueEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "index",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "sessionKey",
            "type": "pubkey"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "slotJoined",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "queueJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "entryIndex",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "commitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "resolved",
      "docs": [
        "outcome: 0 = PlayerAWins, 1 = PlayerBWins, 2 = Tie"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": "pubkey"
          },
          {
            "name": "moveA",
            "type": "u8"
          },
          {
            "name": "moveB",
            "type": "u8"
          },
          {
            "name": "outcome",
            "type": "u8"
          },
          {
            "name": "paidA",
            "type": "u64"
          },
          {
            "name": "paidB",
            "type": "u64"
          },
          {
            "name": "burned",
            "type": "u64"
          },
          {
            "name": "toTreasury",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "revealed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "moveValue",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "timeoutResolved",
      "docs": [
        "scenario: 0 = a_only_revealed, 1 = b_only_revealed, 2 = neither_revealed"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "poolId",
            "type": "u64"
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "scenario",
            "type": "u8"
          },
          {
            "name": "paidA",
            "type": "u64"
          },
          {
            "name": "paidB",
            "type": "u64"
          },
          {
            "name": "burned",
            "type": "u64"
          },
          {
            "name": "toTreasury",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
