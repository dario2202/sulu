<?php

/*
 * This file is part of Sulu.
 *
 * (c) Sulu GmbH
 *
 * This source file is subject to the MIT license that is bundled
 * with this source code in the file LICENSE.
 */

namespace Sulu\Bundle\SecurityBundle\Exception;

/**
 * Exception is thrown when a Role is created or updated with an already existing key.
 */
class RoleKeyAlreadyExistsException extends \Exception
{
    /**
     * @var string
     */
    private $key;

    /**
     * @param string $key
     */
    public function __construct($key)
    {
        $this->key = $key;
        parent::__construct(sprintf('Role with key "%s" already exists', $key), 1101);
    }

    /**
     * Returns the non-unique name of the role.
     *
     * @return string
     */
    public function getKey()
    {
        return $this->key;
    }
}
